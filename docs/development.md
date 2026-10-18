# Developing DECOY

Everything a maintainer needs that a user of the CLI or the site does not. `AGENTS.md` has the working rules (where things live, the security property, commit hygiene); this file has the mechanics.

## Running it

Tools are managed with [mise](https://mise.jdx.dev) (`mise.toml` pins Node 22 and uv and defines the tasks). Without mise, use Node 22 and `npm run <script>` directly.

```sh
mise install
npm ci
mise run dev          # the site on http://localhost:5173
mise run build        # static site in dist/
mise run preview      # serve dist/ on http://127.0.0.1:4173
mise run build:cli    # the CLI and MCP server in dist-cli/
mise run cli -- redact e2e/fixtures/three-pages.pdf -m 'Summer2026!'
```

Checks:

```sh
mise run lint         # ESLint (typescript-eslint, type-checked) and Prettier
mise run typecheck    # tsc --noEmit
mise run test         # Vitest: src/core, src/doc, and src/cli
mise run test:e2e     # Playwright smoke tests against the production build (needs: npx playwright install chromium)
mise run check        # all of the above plus both builds, in CI order
```

`node scripts/make-fixtures.mjs` regenerates the e2e fixtures. `node scripts/screenshots.mjs` takes desktop and 390 px screenshots of the landing page and editor from a running dev server into `e2e/output/shots/`, for comparing with `design/screens/`.

## How it is built

- **Vite 8 + TypeScript (strict) + Preact with signals** for the site. Preact was chosen over vanilla TS and Lit because the settings panel is a dense set of derived values (fit ratio, capacity, alternatives, status label, meter) that re-render on every keystroke, drag, and reroll; signals express that as a handful of `computed`s with no manual DOM bookkeeping, at about 4 kB. The canvas itself is imperative; Preact only owns the chrome around it.
- `src/core/` is pure and unit-tested: `rng` (mulberry32, plus the reference LCG for mosaic jitter), `phrases` (four moods as data with an explicit `profane` flag, templates expanded to over 40 lines per mood), `fit` (font size `0.82·h`, candidates at 85–100 % of `w − 4`, ranked by closeness to 95 % with seeded noise so rerolls vary; two phrases joined for long boxes, chains for longer, short fallbacks for tiny ones), `mosaic` (`blockDarkness`, `mosaicCells`, `rasterizeCells` with integer block edges at `round(c·w/cols)`, a port of `design/mockups/mosaic.js` kept honest by an oracle test), `sample` (paper = mean above the 60th luma percentile, ink = mean below the 5th, fallback ink `#17140F`), `geometry`, `history`, and `grawlix`.
- `src/render/` rasterises the decoy phrase in Courier Prime 700 through a canvas factory (`backend.ts`): the browser's own canvas on the site, `@napi-rs/canvas` in the CLI, so both build the same mosaic for the same box. `src/doc/` loads images and PDFs (pdf.js at 150 dpi) and assembles the image-only PDF with pdf-lib (`pdf-assemble.ts`, shared with the CLI).
- `src/cli/` is the Node side: `document.ts` (pdf.js on a Node canvas, plus the text layer in page pixels), `text-search.ts` (lines from pdf.js runs, regex matches to boxes), `redact.ts`, `verify.ts`, `update.ts`, `run.ts` (the one entry point both the command line and the MCP server call), `main.ts` (commander), and `mcp.ts`. Built by `vite.cli.config.ts` into `dist-cli/decoy.mjs` with the two fonts next to it; `package.json`'s `files` limits the npm tarball to that.
- Build-time Vite plugins (`scripts/vite-*.ts`) inject the CSP into the built HTML only (dev HMR needs inline scripts), copy pdf.js's `cmaps/`, `standard_fonts/`, `iccs/`, and `wasm/` under `/pdfjs/`, emit `version.json`, and generate `sw.js` with the exact list of built assets to precache.
- Profanity is never printed in plain on the website. Everything that displays a phrase goes through `grawlix()`, which keeps the first letter and swaps the vowels for comic-book symbols (`f@ck`). The mosaic always uses the real phrase.

The design kit in `design/` is the source of truth for look and copy.

## QA: attacking the output

`tools/qa/depix-qa.mjs` runs [Depix](https://codeberg.org/spipm/Depixelization_poc), the standard pixelation-reversal tool, against DECOY's exports, next to plain pixelation of the same region for comparison. `mise run qa -- demo` draws a page with a secret in DECOY's own font, pixelates the secret the usual way, decoys the same box through the real app, and runs Depix on both cutouts with a search image rendered by the same browser engine. `mise run qa:attack -- <file>` takes an exported PNG or PDF, finds every mosaic on every page by itself (or asks Claude with `--detect claude`), and runs Depix on each. `tools/qa/README.md` has the pieces (`crop`, `pixelate`, `search-image`, `depix`) behind it and the tool's limits.

## Releasing

The site is a plain static folder (`dist/`) and the CLI is an npm package; the two always share a version. The release practice is described in `AGENTS.md`:

- A branch adds a `changelog.d/<branch>.md` fragment and never touches the version or `CHANGELOG.md`.
- `mise run merge <branch>` merges into `main` under a lock, runs the full suite in a merge-queue worktree, and pushes `main`.
- `mise run release` folds the fragments into `CHANGELOG.md`, writes the version to `package.json`, commits `Release X.Y.Z`, pushes the commit with its `vX.Y.Z` tag, and waits for both workflows below.
- `.github/workflows/ci.yml` runs lint, typecheck, unit tests, both builds, and e2e on every push and pull request. Both release workflows call it as their first job on the tagged commit, so a tag ships nothing those checks did not pass.
- `.github/workflows/deploy.yml` checks the tag against `package.json`, builds, publishes to GitHub Pages, and waits until `https://decoy.ggalmazor.com/version.json` reports the new version.
- `.github/workflows/publish.yml` skips a version already on npm, publishes `@ggalmazor/decoy` with provenance through npm trusted publishing, and waits until the registry serves it.

### One-time setup

1. **DNS:** add a `CNAME` record for `decoy` pointing at `ggalmazor.github.io`. `public/CNAME` already contains `decoy.ggalmazor.com`, so every deploy keeps the custom domain.
2. **GitHub Pages:** in the repository settings, under _Pages_, set _Source_ to **GitHub Actions**, enter `decoy.ggalmazor.com` as the custom domain, wait for the DNS check, and tick **Enforce HTTPS** once the certificate is issued.
3. **Let tags deploy:** the `github-pages` environment that Pages creates only admits deployments from `main`, and a release is a `v*` tag. Under _Settings > Environments > github-pages > Deployment branches and tags_, add a **Tag** rule for `v*`, or run, with an admin account:

   ```sh
   gh api -X POST repos/ggalmazor/decoy/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
   ```

   `deploy/release.sh` checks this rule before it tags and refuses to release while it is missing.

4. **npm trusted publishing:** on npmjs.com, under the package's settings, add GitHub Actions as a trusted publisher with organisation `ggalmazor`, repository `decoy`, workflow `publish.yml`, no environment, and tick **Allow `npm publish`** (without it the publisher may only stage). The very first publish of a new package has to happen by hand with `npm login` and `npm publish`, since a trusted publisher can only be attached to a package that exists. Alternatively an `NPM_TOKEN` repository secret is used when present.
5. **First release:** push `main`, then run `mise run release` (the version starts at 0.0.0, so the first release is 0.1.0; pass `--major` for 1.0.0).

## Credits

Fonts are self-hosted from `design/fonts/` and licensed under the SIL Open Font License 1.1: [Anton](https://fonts.google.com/specimen/Anton) by Vernon Adams, [IBM Plex Mono](https://github.com/IBM/plex) by IBM, and [Courier Prime](https://quoteunquoteapps.com/courierprime/) by Alan Dague-Greene for Quote-Unquote Apps. Their licences are in `design/fonts/LICENSE-*.txt`.

PDF rendering by [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0), PDF writing by [pdf-lib](https://pdf-lib.js.org/) (MIT), Node canvas by [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) (MIT).
