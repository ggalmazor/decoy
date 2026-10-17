### Added

- DECOY: box a secret in a PNG, JPG, WebP, or multi-page PDF and cover it with the pixelated rendering of a decoy phrase sized to the box, in four moods with a profanity switch, with reroll, alternatives, lock, block size, and sampled ink and paper colours.
- Flattened export as PDF (image-only pages at the original size, metadata cleared), PNG (one per page), or the clipboard, with an optional "decoyed" watermark and an Enhance test listing what a depixelizer would recover.
- Undo and redo, keyboard shortcuts, page thumbnails, a bottom-sheet layout on phones, and offline use through a service worker.
- The Enhance lab at `/depix.html` and `scripts/depix.mjs`, a depixelizer that renders every known phrase the way DECOY does and ranks it against an exported box.
