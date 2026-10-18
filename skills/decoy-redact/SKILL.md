---
name: decoy-redact
description: Redact PDFs and images on the local machine by covering secrets with a pixelated decoy phrase, using the `decoy` CLI (find, redact, verify). Use when asked to redact, anonymise, mask, or black out text such as names, account numbers, passwords, or addresses in a document before sharing it.
---

# Redacting documents with decoy

`decoy` covers each secret with a mosaic computed from a decoy phrase, never from the secret, and writes a flattened copy. Nothing is uploaded; everything runs locally. Install once with `npm install -g @ggalmazor/decoy`, or call it as `npx -y @ggalmazor/decoy`.

## Workflow

1. **Look before you redact.** `decoy find <file> --json` lists every line of a PDF with its box in page pixels. Read it to decide what must go and write patterns that match exactly those strings. Images have no text layer: find the boxes another way (the user, OCR, or the web app at https://decoy.ggalmazor.com) and pass them with `--box`.
2. **Redact by pattern, not by hand-typed coordinates, whenever the file is a PDF.**

   ```sh
   decoy redact invoice.pdf \
     -m 'ES\d{2}( ?\d{4}){5}' \
     -m '[\w.+-]+@[\w-]+\.[\w.]+' \
     -m 'Guillermo \w+' \
     --mood corporate --json
   ```

   Patterns are JavaScript regular expressions (flags `gu`), matched per line after joining the runs pdf.js reports, so an IBAN split at every space still matches. Each match becomes one box with 2 px of padding. Add `--box x,y,w,h@page` for anything the text layer does not carry. `--seed <n>` makes the phrase choice reproducible; `--text '<phrase>'` forces one phrase; `--clean` avoids profanity; `--mood` is rude, smug, corporate, or wholesome.

3. **Verify the output, always, with the same patterns.**

   ```sh
   decoy verify invoice-decoyed.pdf -m 'ES\d{2}( ?\d{4}){5}' -m '[\w.+-]+@[\w-]+\.[\w.]+' --original invoice.pdf --json
   ```

   This proves the PDF has no text layer and no metadata, that no pattern is still readable, and that only the matched boxes changed. A `FAIL` on "untouched elsewhere" with narrower patterns than the redaction used is expected: give verify the redaction's patterns.

4. **Report to the user** what was covered (page, box, matched text) and where the file went. The output path defaults to `<name>-decoyed.pdf` (or `.png`) next to the input; `-o` changes it.

## Limits to state plainly

- Only text in the PDF's text layer can be matched. Scanned PDFs and images need explicit boxes.
- A box hides what is under it, but its size still says how long the secret was. Widen boxes to the field when that matters.
- Ink and paper colours are sampled around the box so the mosaic blends in; nothing else of the original is read.

## Staying current

`decoy update` (or the `check_update` MCP tool) asks the npm registry once whether a newer version exists and prints the install command. It is the only network request decoy makes and it never runs on its own. Check at the start of a redaction job when the operator allows network access; otherwise skip it and say so.

## MCP

The same operations are MCP tools (`find_text`, `redact`, `verify`, `check_update`) when the server is configured:

```sh
claude mcp add decoy -- npx -y @ggalmazor/decoy mcp
```
