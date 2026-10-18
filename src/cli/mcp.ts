import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MOODS } from '../core/phrases';
import { MAX_CELL, MIN_CELL } from '../core/mosaic';
import { loadDocument } from './document';
import { runFind, runRedact, type RedactRequest } from './run';
import { checkForUpdate } from './update';
import { verifyOutput } from './verify';

const moodSchema = z.enum(MOODS as unknown as [string, ...string[]]);

const boxSchema = z.object({
  page: z.number().int().min(1).describe('1-based page number'),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
});

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] };
}

// A local MCP server over stdio. Every tool takes file paths on this machine and returns JSON; nothing
// leaves the machine, which is the whole point of the product.
export async function serveMcp(version: string): Promise<void> {
  const server = new McpServer({ name: 'decoy', version });

  server.registerTool(
    'find_text',
    {
      title: 'Find text in a document',
      description:
        'Lists the text runs of a PDF with their boxes in page pixels (150 dpi), optionally only those matching ' +
        'regular expressions. Images have no text layer and return nothing; redact them with explicit boxes.',
      inputSchema: {
        file: z.string().describe('Path to a PDF, PNG, JPG, or WebP file'),
        patterns: z
          .array(z.string())
          .optional()
          .describe('JavaScript regular expressions; omit to list every line'),
      },
    },
    async ({ file, patterns }) => {
      try {
        return json(runFind(await loadDocument(file), patterns ?? []));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'redact',
    {
      title: 'Redact a document with decoys',
      description:
        'Covers every match of the patterns, and every explicit box, with a pixelated decoy phrase, then writes a ' +
        'flattened copy next to the input (or at "out"). The mosaic is computed from the decoy phrase only; the ' +
        'original pixels under a box never influence the output. Returns what was covered and where the file went.',
      inputSchema: {
        file: z.string().describe('Path to a PDF, PNG, JPG, or WebP file'),
        patterns: z
          .array(z.string())
          .optional()
          .describe('JavaScript regular expressions to cover (PDFs only)'),
        boxes: z.array(boxSchema).optional().describe('Explicit boxes in page pixels at 150 dpi'),
        mood: moodSchema
          .optional()
          .describe('Phrase mood: rude, smug, corporate, or wholesome (default smug)'),
        clean: z.boolean().optional().describe('Skip profane phrases'),
        cell: z.number().int().min(MIN_CELL).max(MAX_CELL).optional().describe('Mosaic block size in pixels'),
        seed: z.number().int().optional().describe('Seed for reproducible phrase choice'),
        text: z.string().optional().describe('Use this phrase for every box instead of choosing one'),
        watermark: z.boolean().optional().describe('Stamp "decoyed" in the corner'),
        format: z.enum(['pdf', 'png']).optional().describe('Output format; defaults to the input kind'),
        out: z
          .string()
          .optional()
          .describe('Output path; defaults to <name>-decoyed.<format> next to the input'),
      },
    },
    async (args) => {
      try {
        const request: RedactRequest = {
          patterns: args.patterns ?? [],
          boxes: (args.boxes ?? []).map((b) => ({
            page: b.page - 1,
            rect: { x: b.x, y: b.y, w: b.w, h: b.h },
            source: 'box',
          })),
          mood: args.mood as RedactRequest['mood'],
          clean: args.clean,
          cell: args.cell,
          seed: args.seed,
          text: args.text,
          watermark: args.watermark,
          format: args.format,
          out: args.out,
        };
        return json(await runRedact(await loadDocument(args.file), request));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'verify',
    {
      title: 'Verify a redacted file',
      description:
        'Checks a DECOY output: a PDF has no text layer and no metadata, none of the patterns is readable as text, ' +
        'and, given the original, only the matched boxes changed. Returns the checks and an overall ok.',
      inputSchema: {
        file: z.string().describe('Path to the redacted file'),
        patterns: z.array(z.string()).optional().describe('Regular expressions that must not be readable'),
        boxes: z.array(boxSchema).optional().describe('Boxes that were redacted by hand'),
        original: z.string().optional().describe('Path to the original, to compare pixels outside the boxes'),
      },
    },
    async ({ file, patterns, boxes, original }) => {
      try {
        return json(
          await verifyOutput(file, {
            patterns: patterns ?? [],
            boxes: (boxes ?? []).map((b) => ({
              page: b.page - 1,
              rect: { x: b.x, y: b.y, w: b.w, h: b.h },
              source: 'box',
            })),
            original,
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'check_update',
    {
      title: 'Check for a newer decoy',
      description:
        'Asks registry.npmjs.org for the latest published version of @ggalmazor/decoy and compares it with the ' +
        'running one. This is the only network request decoy ever makes, and it happens only when this tool is ' +
        'called; nothing about the user or their files is sent. Returns installed, latest, updateAvailable, and ' +
        'the install command.',
      inputSchema: {},
    },
    async () => {
      try {
        return json(await checkForUpdate(version));
      } catch (error) {
        return failure(error);
      }
    },
  );

  await server.connect(new StdioServerTransport());
}
