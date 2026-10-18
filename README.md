# DECOY

**Redaction that talks back.** DECOY covers a secret in a PDF or an image with the pixelated rendering of a _different_ phrase, cut to fit the box. Anyone who "enhances" the result recovers the decoy, not the secret. It runs as a command line and an MCP server for agents, and as a small web app at **https://decoy.ggalmazor.com** to show it off. Nothing ever leaves your machine.

## Install

```sh
npm install -g @ggalmazor/decoy      # gives you the `decoy` command
npx -y @ggalmazor/decoy --help       # or run it without installing
```

Node 22 or later.

## Quick start

```sh
decoy find invoice.pdf                                   # what is on the page, with coordinates
decoy redact invoice.pdf -m 'ES\d{2}( ?\d{4}){5}'          # cover every IBAN
decoy verify invoice-decoyed.pdf -m 'ES\d{2}( ?\d{4}){5}' --original invoice.pdf
```

`redact` writes `invoice-decoyed.pdf` next to the input. `verify` proves the result: no text layer, no metadata, no pattern still readable, and not a single pixel changed outside the boxes.

## Commands

### `decoy find <file> [-m <regex>]...`

Lists every line of a PDF's text with its box in page pixels (150 dpi). With one or more `-m` patterns, lists only the matches. Images have no text layer and return nothing; redact them with `-b` boxes.

### `decoy redact <file> [options]`

Covers every match of every `-m` pattern and every `-b` box with a decoy, then writes a flattened copy.

| Option                       | Meaning                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `-m, --match <regex>`        | JavaScript regular expression, matched per line, so a number split at spaces still matches. Repeatable. PDFs only. |
| `-b, --box <x,y,w,h[@page]>` | A box in page pixels, 1-based page, page 1 when omitted. Repeatable. Works for images too.                         |
| `--mood <mood>`              | `rude`, `smug` (default), `corporate`, or `wholesome`.                                                             |
| `--clean`                    | No profanity.                                                                                                      |
| `--text <phrase>`            | Use this phrase for every box instead of letting DECOY pick one.                                                   |
| `--seed <n>`                 | Reproducible phrase choice.                                                                                        |
| `--cell <px>`                | Mosaic block size, 4 to 16 (default 8).                                                                            |
| `--watermark`                | A tiny "decoyed" in the corner.                                                                                    |
| `-f, --format <pdf\|png>`    | Defaults to the input kind. PNG writes one file per page.                                                          |
| `-o, --out <path>`           | Defaults to `<name>-decoyed.<format>` next to the input.                                                           |
| `--json`                     | Machine-readable output (works on every command).                                                                  |

### `decoy verify <file> [-m <regex>]... [-b <box>]... [--original <file>]`

Checks a DECOY output. For a PDF: no text layer, producer is DECOY, author, subject, keywords, and creator are empty. For each pattern: nothing readable matches it. With `--original`: every pattern matched something in the original, pixels inside those boxes changed, and no pixel outside them did. Give it the same patterns and boxes the redaction used. Exit code 0 when everything holds, 1 otherwise.

### `decoy update`

Asks the npm registry whether a newer version exists and prints the install command. This is the only network request DECOY ever makes, and it runs only when you ask.

### `decoy mcp`

Serves the same operations as MCP tools over stdio: `find_text`, `redact`, `verify`, and `check_update`.

## Agents

Wire the MCP server into Claude Code for every project:

```sh
claude mcp add --scope user decoy -- npx -y @ggalmazor/decoy mcp
```

Any other MCP client takes the same command:

```json
{ "mcpServers": { "decoy": { "command": "npx", "args": ["-y", "@ggalmazor/decoy", "mcp"] } } }
```

Then ask for what you want: "redact the IBAN and every email in `~/Downloads/invoice.pdf`, then verify it". The tool descriptions tell the agent to look first, redact by pattern, verify with the same patterns, and report what it covered. `skills/decoy-redact/SKILL.md` is the same routine as a skill for agents that do not speak MCP; copy it into `.claude/skills/` or `~/.claude/skills/`.

## How it works

Pixelation is reversible. A mosaic block is the average colour of the pixels under it, so a depixelizer renders guesses in the font it sees, pixelates them the same way, and keeps the match. Passwords, PINs, and account numbers are the easiest targets.

DECOY never pixelates the secret. The box is filled from the decoy phrase alone: the mosaic is a function of the phrase, the box size, the block size, and two colours sampled around the box so it blends in. The original pixels are discarded before anything is drawn, and the file is rebuilt as images, so no text layer, annotation, or metadata survives. A test in the repository checks that two documents differing only inside a box export identically inside it, and a maintainer's tool runs Depix, a real depixelizer, against the output to make sure it finds nothing.

What DECOY cannot do for you: find text that is not in the PDF's text layer (scans and images need boxes), hide how long the secret was (the box size still says), or unsee what someone already saw.

## Development

`docs/development.md` covers running the site and the tests, how the code is organised, the Depix QA tool, and how releases ship to Pages and npm. `AGENTS.md` has the working rules for anyone, human or otherwise, changing the code.

## Licence

MIT. Fonts under the SIL Open Font License, PDF rendering by pdf.js, PDF writing by pdf-lib; see `docs/development.md` for credits.
