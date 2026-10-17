# Working on DECOY

DECOY is a fully client-side web app. There is no backend, no analytics, and no runtime request to any other origin; the built site is a static folder served from GitHub Pages at https://decoy.ggalmazor.com. `README.md` explains what it does and why; this file is about how to change it.

## Layout

| Path           | What lives there                                                               | Rules                                                                                   |
| -------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `design/`      | The design kit: spec, copy deck, tokens, screenshots, reference mockups, fonts | Source of truth for look and copy. Never load fonts from anywhere else.                 |
| `src/core/`    | Pure logic: rng, phrases, fit, mosaic, sampling, geometry, history, grawlix    | Framework-free, no DOM. Everything here has Vitest coverage.                            |
| `src/render/`  | Text rasterisation and the mosaic bitmap cache                                 | The only place that touches a canvas to produce a mosaic.                               |
| `src/doc/`     | Loading images and PDFs, flattening and export                                 | pdf.js assets are served from `/pdfjs/`; see `scripts/vite-pdfjs-assets.ts`.            |
| `src/ui/`      | Preact components: landing, editor, export dialog                              | State is a set of signals in `state.ts`; mutations are plain functions in `actions.ts`. |
| `src/styles/`  | CSS, starting from `design/tokens.css`                                         | Square corners, hard shadows, one accent colour.                                        |
| `scripts/`     | Vite plugins, fixture generator, screenshot CLI                                |                                                                                         |
| `e2e/`         | Playwright smoke tests and their fixtures                                      | Run against the production build.                                                       |
| `deploy/`      | Merge and release scripts                                                      | See "Merge, release, and deploy".                                                       |
| `changelog.d/` | One changelog fragment per branch                                              | See `changelog.d/README.md`.                                                            |

## The property every change must keep

Pixels inside a box never influence the output. A mosaic is a function of the decoy text, the box size, the block size, and the ink and paper colours, and it is written over the original with an opaque replace, never a blend. `src/core/security.test.ts` checks it; `src/core/mosaic.ts` and `src/core/raster.ts` have no path that reads the document. Keep it that way: if a change needs to look at the document, it belongs in sampling (`sampleInkPaper`), which only ever yields two colours.

`tools/qa/` attacks the claim rather than asserting it: it runs Depix, an off-the-shelf depixelizer, against DECOY's own exports. Run it when the mosaic changes.

## Tooling

Everything goes through mise (`mise.toml`): `mise run dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e`, and `check` for all of CI. Node 22 is pinned there. `npm` is the package manager; there is no lockfile for anything else.

- TypeScript is strict and `verbatimModuleSyntax`; use inline `type` imports.
- ESLint is `typescript-eslint` type-checked; run `npm run lint` before committing. Prettier formats everything, 110 columns, single quotes.
- Vitest covers `src/core`. Playwright (`e2e/`) covers loading, boxing, exporting PNG and PDF, and the shortcuts, against `vite preview` on port 4173.
- Visual checks: `node scripts/screenshots.mjs` writes desktop and 390px screenshots of the landing page and editor to `e2e/output/shots/` from a running dev server. Compare them with `design/screens/`.

## Copy and profanity

All UI copy comes from `design/copy.md`. Profanity exists in the Rude mood and in one landing line, but the website never prints it in plain: anything that displays a phrase goes through `grawlix()` from `src/core/grawlix.ts`, which keeps the first letter and swaps the vowels for comic-book symbols. The decoy text input is the exception, because an input has to show its value. The mosaic always rasterises the real phrase; that is the point.

New phrases go in `src/core/phrases.ts` with an explicit `profane` flag. "Keep it clean" filters on that flag, not on a word list, and the grawlix word list must cover every flagged word (`src/core/grawlix.test.ts` checks).

## Commit hygiene

- One change per commit, with a subject that says what changed and a body that says why when it is not obvious. Never amend a commit that has been pushed.
- Do not touch `version` in `package.json` or `CHANGELOG.md` on a branch. Add a `changelog.d/<branch>.md` fragment with the user-visible effect instead; pure refactors, tests, and docs need none.
- Keep `README.md` and this file in step with the code. A workflow or script that changes behaviour updates the "Merge, release, and deploy" section in the same commit.

## Merge, release, and deploy

```
mise run merge <branch>          # deploy/merge.sh: merge into main, verify, push main
mise run release                 # deploy/release.sh: cut the version, fold changelog.d, tag, deploy
mise run next-version            # what the next release would be called
```

- **`deploy/merge.sh <branch>`** takes a lock shared by every writer of `main`, merges the branch in a merge-queue worktree (`../worktrees/merge-queue`), runs `npm ci`, lint, typecheck, unit tests, the build, and the e2e suite, and only then fast-forwards `main` and pushes it. `--quick` skips the build and e2e for a branch already proven green; `--no-push` leaves `main` local. A branch that moved the version line gets `main`'s version back. If verification fails, `main` did not move.
- **`deploy/release.sh`** takes the same lock, syncs the queue worktree with `origin/main`, folds the pending `changelog.d` fragments into `CHANGELOG.md`, writes the version to `package.json`, commits `Release X.Y.Z`, and pushes that commit and its `vX.Y.Z` tag atomically. The bump is PATCH when every fragment is `### Fixed` only and MINOR otherwise; `--major`, `--minor`, and `--patch` override it, and `--allow-empty` releases internal changes. With nothing pending and `main` already tagged it does nothing.
- **The tag deploys.** `.github/workflows/deploy.yml` runs on `v*` tags, refuses a tag that disagrees with `package.json`, builds, publishes `dist/` to GitHub Pages, and polls `https://decoy.ggalmazor.com/version.json` until it reports the released version. `release.sh` waits for that run (`--no-wait` to skip). `workflow_dispatch` re-deploys the current ref by hand.
- **`.github/workflows/ci.yml`** runs the same checks as `merge.sh` on every push and pull request, so a branch is usually green before it is merged.
- Versions count up from the highest of `package.json`, the newest `v*` tag, and the live `/version.json`, so a number is never handed out twice.
