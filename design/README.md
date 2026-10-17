# DECOY — design kit

DECOY is a client-side tool that hides sensitive text by covering it with the pixelated version of a *different*, funny or rude phrase. This folder is the complete visual and behavioural reference for building it.

| Path | What it is |
|---|---|
| `screens/*.png` | Rendered screenshots: landing (desktop, phone), editor (desktop) and export dialog. Start here. |
| `mockups/*.html` | The same screens as static HTML. Open them in a browser to inspect exact spacing, sizes and colours. **Reference only**: inline-styled and not production code. |
| `mockups/mosaic.js` | The reference mosaic algorithm. The mockups use it to draw every pixelated block, so each block is a real pixelation of its decoy phrase. |
| `tokens.css` / `tokens.json` | Colours, fonts, type scale, spacing, shadows and texture. `tokens.css` includes the `@font-face` rules. |
| `fonts/` | Self-hosted WOFF2 files (Anton, IBM Plex Mono 400/500/600, Courier Prime 400/700) with their OFL licences. The app must not load fonts from Google. |
| `copy.md` | All UI copy, including the states the mockups don't show, plus the seed phrase bank for each mood. |
| `canvas-source/` | The original design-canvas files (`.dc.html`, a custom component format). Only useful if you want the source of truth for a value. |

## Aesthetic: "redacted-dossier punk"
A classified file that talks back. Manila folder ground with faint ruled lines, typewritten documents, black redaction bars, and one loud "classified" red used sparingly. The look is utilitarian and confident, and the humour lives in the copy and the decoys rather than in decoration.

- **Colour:** manila `#E8DCC2` ground, paper `#F6F1E6` / `#FFFCF4` surfaces, ink `#17140F` for text, borders and dark bands. Red `#C8231B` is the *only* accent. Use it for the primary action (Export, or the offset shadow on ink buttons), the active selection, stamps, the LEAKED badge and step numbers. Never use it for body text on dark grounds, where it fails contrast.
- **Type:**
  - Anton, uppercase, for headings, stamps and big numbers.
  - IBM Plex Mono for everything in the UI.
  - Courier Prime for document text and anything that represents a decoy. Decoys are rasterised in Courier Prime 700.
  - Small uppercase labels: 11–12px, weight 600, letter-spacing `.12em`.
- **Shape:** square corners everywhere, `2px solid ink` borders on primary controls and `1px #B7AD9C` on secondary ones. Depth comes from *hard* offset shadows, never blur.
  - Ink buttons: `4px 4px 0 red`.
  - Paper: `14px 16px 0 rgba(23,20,15,.14)`.
  - Dialogs: `16px 18px 0 rgba(23,20,15,.35)`.
- **Signature details:**
  - The 3×3 logo grid (greys plus one red cell) next to the "DECOY" wordmark.
  - Rubber stamps ("DECOYED", "FLATTENED"): rotated −7° to +9°, a 3–4px red border, Anton, red text.
  - The slightly rotated (−1.2°) document on the landing page.
  - Numbered round badges on applied decoys.
  - The dashed red selection with white square handles.
- **Don'ts:** rounded corners, gradients (other than the ruled texture), blurred shadows, emoji, extra accent colours, Inter/Roboto/Arial.

## Accessibility
- Text contrast is at least 4.5:1 everywhere (3:1 for display text of 24px and up). Caption grey is `#3F392F`; don't lighten it.
- Use real `<button>`, `<a href>` and `<input>` + `<label>` elements. Icon-only buttons get an `aria-label`. Toggle buttons use `aria-pressed`.
- Every touch target is at least 44×44px.
- Each mosaic canvas has `role="img"` and an `aria-label` ("Pixelated decoy"). The hero mosaic stands in for the word "secret", which stays in the DOM as visually hidden text.
- The whole editor must be operable from the keyboard: arrow keys nudge the selected box (Shift for ×10), and Tab moves between decoys.
- Respect `prefers-reduced-motion`. The mockups have no animation; if you add any, keep it to a single short reveal.

## Screens

### 1. Landing (`landing-desktop.png`, `landing-mobile.png`)
- Fluid page with content up to 1240px wide and a gutter of `clamp(16px, 4vw, 32px)`. Every grid collapses to one column on a phone with no horizontal scroll.
- Sections, in order:
  1. Header: logo and nav (Why, How it works, Moods, FAQ), plus an "Open a file" ink button with a red shadow.
  2. Hero: the copy and drop zone on the left, the rotated demo document on the right.
  3. Dark "Why" band with the two comparison cards. The DECOY card has a 4px red outline.
  4. Four steps.
  5. Moods grid on a paper band. Each mood card shows two live mosaics with a "decodes to" caption.
  6. FAQ in a two-column grid.
  7. Dark closing CTA with the footer.
- Every mosaic on the landing page is produced at runtime by the same function the editor uses.
- Dropping a file anywhere on the page, pasting an image, or using "Choose a file" opens the editor with that file. Show the drag-over state described in `copy.md`.

### 2. Editor (`editor-desktop.png`)
- A full-viewport app shell with a top bar (dark), a body, and a bottom status bar (dark).
- Body columns: page thumbnails (132px), the canvas area (flexible, manila, scrolls/pans), and the settings panel (360px, paper, 2px ink left border). The phone layout is not mocked up; design it from these rules. Under about 900px, hide the thumbnail column behind a page picker in the top bar, wrap the top bar's tools into a second row, and turn the settings panel into a bottom sheet (collapsed to the decoy text, Reroll and Apply; expandable to the full panel). Keep the status bar at the bottom of the viewport.
- **Selection:**
  - A 2px dashed red outline with a very light red wash (`rgba(200,35,27,.06)`).
  - 8px white square handles with red borders at the corners. Edge handles are optional.
  - A red size tag above the box: `W × H · fits N chars`.
  - The box shows a live preview of the mosaic.
- **Applied decoys:** drawn into the page, each with a black round numbered badge at its top-right corner. Clicking one selects it, and its settings load into the panel. Applied decoys can be moved, resized and deleted.
- **Panel sections**, in order:
  1. Title and area tag.
  2. W / H / Fits stats in a bordered three-cell row.
  3. Mood segmented control (4 equal cells; the selected cell is ink with paper text).
  4. "Keep it clean" checkbox.
  5. Decoy text input (Courier Prime 700, 17px) with a fit meter: an 8px track, ink fill, and a "N / M characters" count with a status label.
  6. Reroll (ink) and Lock (outlined) buttons.
  7. "Also fits": three alternatives as full-width rows showing their character counts. Clicking one picks it.
  8. Mosaic block size (range 4–16, default 8) and the Ink / Paper swatches, which are sampled automatically; clicking a swatch opens a colour picker or an eyedropper.
  9. Apply decoy (red, full width) and Cancel.
  10. "On this page": a list of applied decoys with a label, the phrase and a remove button.
- **Status bar:** the privacy line on the left, keyboard hints on the right.

### 3. Export dialog (`export-desktop.png`)
- A modal (`<dialog>`) over a darkened backdrop.
  - Left: the flattened preview of the current page with a FLATTENED stamp, plus a caption with the page, the number of decoys and the pixel size.
  - Right: title and line, format radio cards, options, an "Enhance test" table, and the primary download button with "Back to editing".
- The **Enhance test** lists every decoy as its mosaic thumbnail → the phrase in red: a playful reassurance that this is all a depixelizer can get back.

## The mosaic (must match `mockups/mosaic.js`)
1. Rasterise **only the decoy phrase** to an offscreen canvas of the box size (w×h): white ground, black Courier Prime 700 text at `0.82·h`, shrunk to fit `w − 4` if needed, left-aligned at x = 2 and vertically centred.
2. Split it into `cols = round(w / cell)` × `rows = round(h / cell)` blocks, and average each block's darkness (1 − luminance).
3. Normalise by the darkest block and cap darkness at 0.9, so no block reaches pure ink. Add ±0.03 seeded jitter so it reads like a real compressed mosaic.
4. Colour each block `paper + (ink − paper) · t`, where ink and paper are sampled from the document around the box.
5. Write the result **over** the box, replacing pixels (`putImageData` or an equivalent opaque write, never alpha blending), so nothing of the original survives inside the box.

The original pixels under the box must never feed into steps 1–5. The only things taken from the document are the two sampled colours.
