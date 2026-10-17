# DECOY — copy deck and phrase seeds

The mockups hold the final copy for the landing page, the editor and the export dialog. This file collects it in one place, adds the strings the mockups don't show (empty, loading and error states), and seeds the decoy phrase bank.

## Voice
- Dry, deadpan and a little rude. The joke is that the tool is serious about security and impolite about everything else.
- Short sentences, no exclamation marks, no emoji.
- Profanity appears in the **Rude** mood and in one landing line ("to fuck off"). Everything else in the UI is clean.

## Landing
- Eyebrow: `FILE NO. 0451` · `Redaction that talks back`
- H1: **Pixelate the lie, not the** [mosaic of "nope"; screen-reader text "secret."]
- Lead: Pixelated text can be un-pixelated. So DECOY never blurs what is really there: it paints over your password, IBAN or phone number with a pixelated insult cut to fit the box. Whoever "enhances" it gets told, in perfect detail, to fuck off.
- Drop zone: **Drop a PDF, PNG or JPG here** / or paste a screenshot. It never leaves this tab. / button **Choose a file**
- Ticks: No uploads, no server · Works with the Wi-Fi off · Exports flattened
- Demo annotation: Run the password box through any depixelizer. It will proudly recover: **"you thought this was a password?"**
- Why: **Pixelation is a puzzle, not a lock.** A mosaic block is just the average colour of the pixels beneath it. Render guesses in the same font, pixelate them the same way, keep whichever matches: that is all a depixelizer does, and short secrets like passwords and PINs are exactly what it is best at. DECOY takes the puzzle off the table. The pixels in the box come from a different sentence.
  - Plain pixelation (what everyone does): 1 · Under the box `Summer2026!` → 2 · What you share [mosaic] → 3 · What they recover `Summer2026!` **LEAKED**
  - With DECOY (what you should do): `Summer2026!` (struck through; "discarded before anything is drawn") → [mosaic] → `nice try, enhance harder` **DESERVED**
- How: **Four steps. Zero uploads.**
  - 01 Open it here: Drop a PDF, PNG or JPG, or paste a screenshot. Your browser reads it straight from disk. There is no server to send it to.
  - 02 Box the secret: Drag over a password, an IBAN, a phone number. DECOY measures the box and works out how many characters fit in it.
  - 03 Pick a mood, reroll: Decoys are generated to the size of the box, so the mosaic looks like it belongs there. Reroll until it is perfect, or type your own.
  - 04 Export it flattened: The page is re-drawn as an image with the real pixels gone. No hidden text layer, no metadata, nothing left to un-blur.
- Moods: **Pick a mood. Reroll till it fits.** Every decoy is built from phrase templates and trimmed to the width of your box, so the mosaic has the right rhythm for the line it sits on. Profanity is one switch away from off, for the documents your boss will see.
- FAQ: **Questions, asked suspiciously**
  - Does my file get uploaded? No. DECOY is a static page. Files are opened with the browser's File API, drawn onto a canvas and exported from that canvas. Load it once and it keeps working with the network unplugged.
  - Can anyone recover what I covered? Not from the export. The box is filled from the decoy text alone, so the original pixels never reach the mosaic. PDFs are flattened to images, so no text layer survives underneath either.
  - Where do the insults come from? Phrase templates, filled in and trimmed until they fit the box. Pick a mood, switch profanity off, or write your own line.
- Closing CTA: **Keep the secret. Send the insult.** / Open a file
- Footer: DECOY runs entirely in your browser. · [SOURCE LINK] · [LICENSE]

## Landing states not in the mockups
- Drag-over (a file is dragged anywhere over the page): the drop zone's border goes solid red, with the message **Let go. We won't look.**
- Unsupported file: **That's not a PDF, PNG, JPG or WebP. We only redact the classics.**
- Encrypted PDF: **This PDF is password-protected. Ironic. Unlock it first.**
- Loading a large PDF: **Rendering page 3 of 41…**

## Editor
- Top bar: `<filename>` · `page 1 / 3` · lock chip **local only** · tools Select area, Pan, Undo, Redo, zoom `100%` · **Export**
- Thumbnails: `1 · 3 decoys`
- Selection tag: `380 × 24 · fits 33 chars`
- Panel: **DECOY** / `AREA 3 · NEW` (or `AREA 2` when editing an applied one) / Width · Height · Fits / Mood: Rude · Smug · Corporate · Wholesome / ☐ Keep it clean (no profanity) / Decoy text / meter `32 / 33 characters` + status / **Reroll** · **Lock** / Also fits / Mosaic: Block size, Ink · sampled, Paper · sampled / **Apply decoy** · Cancel / On this page
- Fit status labels: `Fits snugly` (≥ 90%), `Fits` (75–90%), `A bit short` (< 75%), `Too long, will shrink` (> 100%)
- Empty panel (no selection): **Drag over anything you'd rather not share.** / Tip: double-click a decoy to edit it.
- Footer: `0 bytes uploaded · everything stays in this tab` · `Drag to box a secret · Enter to apply · R to reroll`

## Export
- Title: **Ready to leak** / Every page is re-drawn as an image. The real text under the boxes is gone, not hidden.
- Formats: PDF (flattened, N pages) · PNG (one per page) · Clipboard (current page)
- Options: ☑ Strip metadata (author, software, EXIF) · ☐ Add a tiny "decoyed" watermark
- Enhance test (what a depixelizer would get): mosaic → recovered phrase, in red
- Primary: **Download PDF** / **Download PNG** / **Copy to clipboard** · Back to editing
- Done toast: **Leaked responsibly.** · Clipboard: **Copied. Paste with confidence.**
- Zero decoys warning: **You haven't covered anything yet. Export anyway?**

## Phrase seeds
These are starting points; the app should expand them with templates. Mark profanity with a flag in the data. Don't rely on a word-list regex alone.

**Rude** (profanity unless marked †)
fuck off · fuck right off · kindly fuck off · piss off, nerd · sod off · bugger off · none of your business† · mind your own business† · get your own password† · go away† · absolutely not, mate† · who asked?† · nice try, dipshit · back off, creep† · get a life† · stop squinting† · zoom out, loser† · not today, buddy† · keep dreaming† · how about no† · take a hike† · get lost† · bite me† · nosy little gremlin† · eat glass, snoop†
Templates: `{off} off, {target}` with off = fuck, piss, sod, bugger, back†, buzz†, shove†; target = nerd, creep, buddy, pal, snoop, detective, hacker, weirdo

**Smug** (default, clean)
you thought this was a password? · nice try, enhance harder · enhance harder, detective · wow, you really zoomed in · nothing to see here, nerd · lol no · imagine trying this hard · you've been decoyed · this is not the password · still not the password · keep squinting · nope, try again · did you really think that'd work? · the real one is in my head · congratulations, you found nothing · 10/10 effort, 0/10 result · zoom and enhance... nope · this took you how long? · plot twist: it's not here · your depixelizer is proud of you · adorable attempt
Templates: `{opener}, {target}` with opener = nice try, good effort, so close, bless your heart, adorable attempt, almost

**Corporate** (clean)
per my last email: no · let's take this offline · circling back: no · this is above your pay grade · please see attached nothing · as previously discussed, no · let's park this indefinitely · not a priority this quarter · request denied by legal · out of office, forever · synergy not found · we'll circle back never · this has been escalated to nobody · thanks for your interest. no. · ticket closed: won't fix · HR has been notified · noted, and ignored · per policy, no · not in scope · kindly revert with nothing
Templates: `{opener}: {verdict}` with opener = per my last email, as discussed, circling back, just flagging, quick sync; verdict = no, still no, hard pass, won't fix

**Wholesome** (clean)
go drink some water · you're doing great, sweetie · have you eaten today? · call your mother · take a deep breath · go touch some grass · you deserve a nap · stretch your back · be kind to yourself · go outside, it's sunny · pet a dog today · hydrate, then investigate · you are enough · posture check · go to bed, it's late · make yourself a tea · drink water, not secrets
Templates: `{advice}, {endearment}` with endearment = friend, sweetie, pal, champ, buddy

Boxes longer than any phrase: join two phrases with `. ` (for example "lol no. nothing to see here, nerd"). Boxes too short for any phrase: shortest-first fallbacks: `no` · `nope` · `lol` · `nah` · `no.` and, for Rude only, `fu`.
