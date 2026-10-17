# QA: attacking the output

`depix-qa.mjs` runs [Depix](https://codeberg.org/spipm/Depixelization_poc), the standard pixelation-reversal tool, against DECOY's own exports, and against plain pixelation of the same region for comparison. It is a maintainer's tool, not part of the site.

Depix works the way every depixelizer does: it pixelates a _search image_ (a De Bruijn sequence of the expected characters, rendered in the same font and size as the original) at every offset and looks for blocks whose average colour equals a block in the pixelated cutout. Every text drawn here goes through headless Chromium against the built site, so the search image is rendered by the same engine, font (Courier Prime 700), size (0.82 × box height), and vertical placement DECOY uses: the best case an attacker can hope for.

## Setup

```sh
mise install            # node 22 and uv
npm ci && npm run build # the tool drives the built site in dist/
mise run qa -- setup    # clones Depix at a pinned commit into tools/qa/.depix (gitignored)
```

Depix runs under `uv run --python 3.12 --with pillow`; uv fetches Python and Pillow on first use.

## The demo

```sh
mise run qa -- demo [--secret 'Summer2026!'] [--block 8] [--height 24] [--mood rude]
```

1. Draws a page with `Password   <secret>` in DECOY's font and size.
2. Renders the search image: a De Bruijn sequence over letters, digits, space, and `,.'?!:`.
3. Pixelates the secret's box the way everyone does it (integer mean per block, the filter Depix expects) and runs Depix on it.
4. Opens the same page in the real app, boxes the secret, applies the decoy, exports the PNG, cuts the mosaic out (snapped to its block grid), and runs Depix on that.

How to read it: Depix prints `[N straight matches | M multiple matches]` for each cutout, and writes an image where every block is replaced by the search-image pixels it matched (the average of them when several did). Open `tmp/qa/demo-plain-depix.png` and `tmp/qa/demo-decoy-depix.png` side by side, zoomed. On the plain pixelation Depix finds a match for every block and the output shows fragments of the secret's glyphs; how legible they are depends on the text size and block size (`--height 40 --block 8` is far more readable than the 24 px default, because larger glyphs leave fewer ambiguous blocks). On the DECOY export the blocks are not the average of any text in any font (they are a normalised, capped, jittered rendering of a different sentence), so most of what Depix matches is coincidence, and nothing of the secret can appear because nothing of it is in the pixels.

## Pieces

```sh
mise run qa -- crop <export.png> <x,y,w,h> [--no-snap] [--out tmp/qa/pixelated.png]
mise run qa -- pixelate <image.png> <x,y,w,h> --block 8 [--out ...]
mise run qa -- search-image --height 24 [--chars "abc..."] [--order 2] [--font '"Courier Prime"'] [--px 20]
mise run qa -- depix <pixelated.png> <search.png> [--average linear|gammacorrected] [--background r,g,b]
```

`crop` snaps a hand-drawn box to the mosaic under it: block boundaries are luma steps and flat paper has none, so the first and last steps on each axis are the mosaic's outline. Pass `--no-snap` to cut exactly what you typed. Depix's block detector merges neighbouring blocks of identical colour and drops pure black and pure white ones, so a cutout with blank rows or partial blocks at its edges hides blocks from it; the demo trims its box to the ink and to whole blocks for that reason.

To attack a real export: `crop` the box, make a `search-image` with `--height` equal to the cut-out's height (the font size follows from it), then `depix` the two. If you know the original document's font, render the search image with `--font` and `--px` instead and Depix will look for the real text; it will not find it, because nothing of it is in the pixels.

## Limits

- Depix compares block averages for exact equality. It needs the pixelated image to be a lossless (PNG) linear box filter of text rendered by the same engine as the search image. JPEG, scaling, or a different rasteriser breaks it, for the secret and the decoy alike. That is a limit of Depix, not a protection; a tolerant matcher would recover the decoy from DECOY's export, which is the intended outcome.
- Block detection in Depix is heuristic (its `Found N same color rectangles` line tells you how many it saw). If the count is far below the real number of blocks, cut the box tighter or to whole blocks, or try a different `--block`.
- [Unredacter](https://github.com/BishopFox/unredacter) is the other well-known tool (brute force with tolerance, in Electron). It is interactive and tuned per font by hand, so it is not wired in here; its approach is the one the "Enhance test" in the export dialog describes.
