import { Command, InvalidArgumentError } from 'commander';
import { grawlix } from '../core/grawlix';
import { MAX_CELL, MIN_CELL } from '../core/mosaic';
import { MOODS, type Mood } from '../core/phrases';
import { LOAD_MESSAGES, LoadError } from '../doc/types';
import { loadDocument } from './document';
import { serveMcp } from './mcp';
import { parseBoxArg } from './redact';
import { runFind, runRedact } from './run';
import { verifyOutput } from './verify';

const VERSION = typeof __DECOY_VERSION__ === 'string' ? __DECOY_VERSION__ : '0.0.0-dev';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function integer(min: number, max: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new InvalidArgumentError(`expected an integer between ${min} and ${max}`);
    return n;
  };
}

function mood(value: string): Mood {
  if (!(MOODS as readonly string[]).includes(value))
    throw new InvalidArgumentError(`expected one of ${MOODS.join(', ')}`);
  return value as Mood;
}

function fail(error: unknown): never {
  const message =
    error instanceof LoadError ? LOAD_MESSAGES[error.code] : ((error as Error).message ?? String(error));
  console.error(`decoy: ${message}`);
  process.exit(error instanceof LoadError ? 3 : 2);
}

const program = new Command()
  .name('decoy')
  .description(
    'Redact PDFs and images by painting a pixelated decoy phrase over the secret. Runs entirely on this machine.',
  )
  .version(VERSION)
  .option('--json', 'machine-readable output');

program
  .command('find')
  .description('list the text of a PDF with boxes in page pixels, or only the matches of patterns')
  .argument('<file>', 'PDF, PNG, JPG, or WebP')
  .option('-m, --match <regex>', 'pattern to look for (repeatable)', collect, [] as string[])
  .action(async (file: string, opts: { match: string[] }) => {
    try {
      const result = runFind(await loadDocument(file), opts.match);
      if (program.opts().json) return console.log(JSON.stringify(result, null, 2));
      if (result.kind === 'image') return console.log('An image has no text layer; redact it with --box.');
      const rows = result.matches ?? result.lines ?? [];
      if (rows.length === 0) return console.log(opts.match.length ? 'No match.' : 'No text.');
      for (const row of rows) {
        const r = row.rect;
        console.log(`page ${row.page}  ${r.x},${r.y} ${r.w}×${r.h}  ${JSON.stringify(row.text)}`);
      }
    } catch (error) {
      fail(error);
    }
  });

program
  .command('redact')
  .description('cover every match and every box with a decoy and write a flattened copy')
  .argument('<file>', 'PDF, PNG, JPG, or WebP')
  .option(
    '-m, --match <regex>',
    'cover every match of this pattern (repeatable, PDFs only)',
    collect,
    [] as string[],
  )
  .option(
    '-b, --box <x,y,w,h[@page]>',
    'cover this box in page pixels at 150 dpi (repeatable)',
    collect,
    [] as string[],
  )
  .option('--mood <mood>', `phrase mood: ${MOODS.join(', ')}`, mood)
  .option('--clean', 'no profanity')
  .option('--cell <px>', `mosaic block size, ${MIN_CELL}-${MAX_CELL}`, integer(MIN_CELL, MAX_CELL))
  .option('--seed <n>', 'reproducible phrase choice', integer(0, Number.MAX_SAFE_INTEGER))
  .option('--text <phrase>', 'use this phrase for every box')
  .option('--watermark', 'stamp "decoyed" in the corner')
  .option('--keep-title', 'keep the file name as the PDF title')
  .option('-f, --format <pdf|png>', 'output format; defaults to the input kind', (v: string) => {
    if (v !== 'pdf' && v !== 'png') throw new InvalidArgumentError('expected pdf or png');
    return v;
  })
  .option('-o, --out <path>', 'output path; defaults to <name>-decoyed.<format> next to the input')
  .action(
    async (
      file: string,
      opts: {
        match: string[];
        box: string[];
        mood?: Mood;
        clean?: boolean;
        cell?: number;
        seed?: number;
        text?: string;
        watermark?: boolean;
        keepTitle?: boolean;
        format?: 'pdf' | 'png';
        out?: string;
      },
    ) => {
      try {
        const result = await runRedact(await loadDocument(file), {
          patterns: opts.match,
          boxes: opts.box.map(parseBoxArg),
          mood: opts.mood,
          clean: opts.clean,
          cell: opts.cell,
          seed: opts.seed,
          text: opts.text,
          watermark: opts.watermark,
          keepTitle: opts.keepTitle,
          format: opts.format,
          out: opts.out,
        });
        if (program.opts().json) return console.log(JSON.stringify(result, null, 2));
        for (const d of result.decoys) {
          const r = d.rect;
          const covered = d.covered === 'box' ? 'box' : JSON.stringify(d.covered);
          console.log(`page ${d.page}  ${r.x},${r.y} ${r.w}×${r.h}  ${covered} -> "${grawlix(d.text)}"`);
        }
        for (const out of result.outputs)
          console.log(`wrote ${out.path} (${(out.bytes / 1024).toFixed(1)} kB)`);
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('verify')
  .description('check a redacted file: no text layer, no metadata, patterns gone, nothing else touched')
  .argument('<file>', 'the redacted PDF or image')
  .option('-m, --match <regex>', 'pattern that must not be readable (repeatable)', collect, [] as string[])
  .option('-b, --box <x,y,w,h[@page]>', 'box that was redacted by hand (repeatable)', collect, [] as string[])
  .option('--original <file>', 'the original, to confirm only the matched boxes changed')
  .action(async (file: string, opts: { match: string[]; box: string[]; original?: string }) => {
    try {
      const report = await verifyOutput(file, {
        patterns: opts.match,
        boxes: opts.box.map(parseBoxArg),
        original: opts.original,
      });
      if (program.opts().json) console.log(JSON.stringify(report, null, 2));
      else {
        for (const c of report.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
        console.log(report.ok ? 'verified' : 'NOT verified');
      }
      process.exit(report.ok ? 0 : 1);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('mcp')
  .description('serve find_text, redact, and verify as MCP tools over stdio')
  .action(async () => {
    try {
      await serveMcp(VERSION);
    } catch (error) {
      fail(error);
    }
  });

await program.parseAsync(process.argv);
