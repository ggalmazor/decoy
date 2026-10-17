# DECOY

**Pixelate the lie, not the secret.** DECOY is a client-side redaction tool. When you box a password, an IBAN, or a phone number in a screenshot or a PDF, it throws the original pixels away and fills the box with the _pixelated rendering of a different phrase_, a funny or rude one cut to fit, so anyone who "enhances" the export recovers the insult instead of the secret.

Live at **https://decoy.ggalmazor.com**. Nothing you open ever leaves the tab.

## Why plain pixelation is unsafe

A mosaic block is just the average colour of the pixels under it. Pixelation is lossy, but it is not random: the same text in the same font, pixelated the same way, gives the same blocks every time. A depixelizer uses exactly that. It renders guesses (every word in a dictionary, every eight-character string, every phrase it can think of) in the font it sees on the page, pixelates each one with the block size it measures, and keeps whichever matches the blocks best. Short, structured secrets such as passwords, PINs, and account numbers are the easiest targets, because the search space is small and the font is known.

Blurring is no better; it is a different averaging kernel. The only redaction that cannot be reversed is one where the output carries no information about the input. A black bar does that. DECOY does that too, and is funnier: the box is filled from a decoy phrase, so the puzzle a depixelizer solves is a puzzle about the decoy. `tools/qa/` holds a shell tool that runs an off-the-shelf depixelizer against DECOY's own exports; see [QA: attacking the output](#qa-attacking-the-output).

## What DECOY does

1. **Open** a PNG, JPG, or WebP, or a multi-page PDF, by dropping it, picking it, or pasting a screenshot.
2. **Box** the secret. DECOY measures the box in page pixels, samples the document's ink and paper colours around it (the only two things it ever reads from the page), and works out how many characters fit.
3. **Pick a mood** (Rude, Smug, Corporate, Wholesome), reroll until the line is right, pick an alternative, or type your own. "Keep it clean" removes every profane phrase from every mood. The mosaic previews live in place.
4. **Export flattened.** Pages are re-drawn as images: PNG (one per page), PDF (image-only pages at the original page size, title/author/subject/keywords/creator cleared, producer set to "DECOY"), or the clipboard. An optional tiny "decoyed" watermark goes in the corner. The export dialog lists every decoy with what a depixelizer would recover.

The editor has move, resize (re-fits the phrase unless you lock it), nudge with the arrow keys (Shift for 10 px), undo and redo, zoom, a pan tool (or hold Space), thumbnails with per-page counts, and a bottom-sheet layout on phones. Enter applies, Esc cancels, R rerolls, Delete removes.

## Privacy model

- **Read from the document:** its pixels, to display it and to export it, and two colours per box (paper and ink) sampled from a 6 px margin around the box. Nothing else.
- **Never read into a mosaic:** the pixels inside the box. The mosaic is a pure function of the decoy text, the box size, the block size, and those two colours (`src/core/mosaic.ts`), and it is written over the page with an opaque replace, never a blend (`src/core/raster.ts`). `src/core/security.test.ts` checks that two documents differing only inside a box export identically inside it.
- **Never sent anywhere:** anything. The site is static. There are no uploads, no analytics, no third-party requests, no CDN fonts; the fonts, pdf.js worker, CMaps, and standard fonts are served from this origin. The built `index.html` carries a Content-Security-Policy that allows `self` only, and a service worker caches the app shell so the page keeps working with the network off once it has loaded.
- **Removed on export:** EXIF and every other chunk of the source image (re-encoding from a canvas drops them), and for PDFs the text layer, annotations, forms, attachments, and metadata, because the PDF is rebuilt from scratch out of page images rather than edited.

Things DECOY does not protect you from: text elsewhere on the page that repeats the secret, filenames, and the memory of whoever already saw the original.

## Running it

Tools are managed with [mise](https://mise.jdx.dev) (`mise.toml` pins Node 22 and defines the tasks). Without mise, use Node 22 and `npm run <script>` directly.

```sh
mise install
npm ci
mise run dev          # http://localhost:5173
mise run build        # static site in dist/
mise run preview      # serve dist/ on http://127.0.0.1:4173
```

Checks:

```sh
mise run lint         # ESLint (typescript-eslint, type-checked) and Prettier
mise run typecheck    # tsc --noEmit
mise run test         # Vitest: everything in src/core
mise run test:e2e     # Playwright smoke tests against the production build (needs: npx playwright install chromium)
mise run check        # all of the above, in CI order
```

`node scripts/make-fixtures.mjs` regenerates the e2e fixtures. `node scripts/screenshots.mjs` takes desktop and 390 px screenshots of the landing page and editor from a running dev server into `e2e/output/shots/`, for comparing with `design/screens/`.

## How it is built

- **Vite 8 + TypeScript (strict) + Preact with signals.** Preact was chosen over vanilla TS and Lit because the settings panel is a dense set of derived values (fit ratio, capacity, alternatives, status label, meter) that re-render on every keystroke, drag, and reroll; signals express that as a handful of `computed`s with no manual DOM bookkeeping, at about 4 kB. The canvas itself is imperative (pointer events and a compositing effect); Preact only owns the chrome around it.
- `src/core/` is pure and unit-tested: `rng` (mulberry32, plus the reference LCG for mosaic jitter), `phrases` (four moods as data with an explicit `profane` flag, templates expanded to over 40 lines per mood), `fit` (font size `0.82·h`, candidates at 85–100 % of `w − 4`, ranked by closeness to 95 % with seeded noise so rerolls vary; two phrases joined for long boxes, chains for longer, short fallbacks for tiny ones), `mosaic` (`blockDarkness`, `mosaicCells`, `rasterizeCells` with integer block edges at `round(c·w/cols)`, a port of `design/mockups/mosaic.js` kept honest by an oracle test), `sample` (paper = mean above the 60th luma percentile, ink = mean below the 5th, fallback ink `#17140F`), `geometry`, `history`, and `grawlix`.
- `src/render/` rasterises the decoy phrase in Courier Prime 700 and caches each mosaic bitmap by its parameters. `src/doc/` loads images with `createImageBitmap` and PDFs with pdf.js at 150 dpi, and exports with canvas re-encoding and pdf-lib.
- Build-time Vite plugins (`scripts/vite-*.ts`) inject the CSP into the built HTML only (dev HMR needs inline scripts), copy pdf.js's `cmaps/`, `standard_fonts/`, `iccs/`, and `wasm/` under `/pdfjs/`, emit `version.json`, and generate `sw.js` with the exact list of built assets to precache.
- Profanity is never printed in plain on the website. Everything that displays a phrase goes through `grawlix()`, which keeps the first letter and swaps the vowels for comic-book symbols (`f@ck`). The mosaic always uses the real phrase.

The design kit in `design/` is the source of truth for look and copy; `AGENTS.md` explains the working rules.

## Deploying

The site is a plain static folder (`dist/`), so it can be served from anywhere. The repository deploys to GitHub Pages at `decoy.ggalmazor.com` following the release practice described in `AGENTS.md`:

- A branch adds a `changelog.d/<branch>.md` fragment and never touches the version or `CHANGELOG.md`.
- `mise run merge <branch>` merges into `main` under a lock, runs the full suite in a merge-queue worktree, and pushes `main`.
- `mise run release` folds the fragments into `CHANGELOG.md`, writes the version to `package.json`, commits `Release X.Y.Z`, and pushes the commit with its `vX.Y.Z` tag.
- The tag triggers `.github/workflows/deploy.yml`, which checks the tag against `package.json`, builds, publishes to Pages with `actions/upload-pages-artifact` and `actions/deploy-pages`, and waits until `https://decoy.ggalmazor.com/version.json` reports the new version. `.github/workflows/ci.yml` runs lint, typecheck, unit, build, and e2e on every push and pull request.

### One-time setup

1. **DNS:** add a `CNAME` record for `decoy` pointing at `ggalmazor.github.io`. `public/CNAME` already contains `decoy.ggalmazor.com`, so every deploy keeps the custom domain.
2. **GitHub Pages:** in the repository settings, under _Pages_, set _Source_ to **GitHub Actions**, enter `decoy.ggalmazor.com` as the custom domain, wait for the DNS check, and tick **Enforce HTTPS** once the certificate is issued.
3. **First release:** push `main`, then run `mise run release` (the version starts at 0.0.0, so the first release is 0.1.0; pass `--major` for 1.0.0).

## Credits

Fonts are self-hosted from `design/fonts/` and licensed under the SIL Open Font License 1.1: [Anton](https://fonts.google.com/specimen/Anton) by Vernon Adams, [IBM Plex Mono](https://github.com/IBM/plex) by IBM, and [Courier Prime](https://quoteunquoteapps.com/courierprime/) by Alan Dague-Greene for Quote-Unquote Apps. Their licences are in `design/fonts/LICENSE-*.txt`.

PDF rendering by [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0), PDF writing by [pdf-lib](https://pdf-lib.js.org/) (MIT).

DECOY is released under the [MIT License](LICENSE).
