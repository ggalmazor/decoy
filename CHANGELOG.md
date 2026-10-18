# Changelog

All notable, user-visible changes to DECOY. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are cut by `deploy/release.sh` from the fragments in `changelog.d/`.

## [Unreleased]

## [1.1.0]

### Added
- A command line and MCP server, published as `@ggalmazor/decoy`: `decoy find` lists a PDF's text with boxes, `decoy redact` covers pattern matches and explicit boxes with decoys, `decoy verify` checks an output, and `decoy mcp` serves the three as tools. Same core as the site, nothing leaves the machine.
- `skills/decoy-redact/SKILL.md`, a skill agents can load to redact documents with the CLI.

### Changed
- The landing page footer carries the copyright notice and a link to ggalmazor.com.

## [1.0.0]

### Added
- DECOY: box a secret in a PNG, JPG, WebP, or multi-page PDF and cover it with the pixelated rendering of a decoy phrase sized to the box, in four moods with a profanity switch, with reroll, alternatives, lock, block size, and sampled ink and paper colours.
- Flattened export as PDF (image-only pages at the original size, metadata cleared), PNG (one per page), or the clipboard, with an optional "decoyed" watermark and an Enhance test listing what a depixelizer would recover.
- Undo and redo, keyboard shortcuts, page thumbnails, a bottom-sheet layout on phones, and offline use through a service worker.
- The Enhance lab at `/depix.html` and `scripts/depix.mjs`, a depixelizer that renders every known phrase the way DECOY does and ranks it against an exported box.

