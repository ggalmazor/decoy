import { useRef } from 'preact/hooks';
import { grawlix } from '../../core/grawlix';
import { ACCEPT } from '../../doc/load';
import * as actions from '../actions';
import * as s from '../state';
import { ArrowBackIcon, CheckIcon, UploadIcon } from '../shared/icons';
import { Logo } from '../shared/logo';
import { MosaicCanvas } from '../shared/mosaic-canvas';

declare const __DECOY_VERSION__: string;

const REPO = 'https://github.com/ggalmazor/decoy';

function FilePicker({ class: className, children }: { class?: string; children: preact.ComponentChildren }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" class={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        class="sr-only"
        tabIndex={-1}
        data-testid="file-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void actions.openFile(file);
          e.currentTarget.value = '';
        }}
      />
    </>
  );
}

export function Landing() {
  const dragging = s.dragOver.value;
  const error = s.loadError.value;
  return (
    <div class="landing">
      <header class="landing__header">
        <Logo />
        <nav class="landing__nav" aria-label="Main">
          <a href="#why">Why</a>
          <a href="#how">How it works</a>
          <a href="#moods">Moods</a>
          <a href="#faq">FAQ</a>
          <FilePicker class="btn btn--shadow">Open a file</FilePicker>
        </nav>
      </header>

      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow">
            <span class="eyebrow__file">File no. 0451</span>
            <span>Redaction that talks back</span>
          </p>
          <h1 class="display hero__title">
            <span>Pixelate</span>
            <span>the lie,</span>
            <span class="hero__last">
              not the <span class="sr-only">secret.</span>
              <MosaicCanvas
                text="nope"
                w={150}
                h={92}
                cell={23}
                paper="#E8DCC2"
                label="the word secret, pixelated"
                class="hero__mosaic"
              />
            </span>
          </h1>
          <p class="hero__lead">
            Pixelated text can be un-pixelated. So DECOY never blurs what is really there: it paints over your
            password, IBAN or phone number with a pixelated insult cut to fit the box. Whoever “enhances” it
            gets told, in perfect detail, to {grawlix('fuck')} off.
          </p>
          <div class={`dropzone${dragging ? ' dropzone--over' : ''}`} data-testid="dropzone">
            <UploadIcon size={36} strokeWidth={1.8} />
            <div class="dropzone__text">
              {dragging ? (
                <strong>Let go. We won't look.</strong>
              ) : (
                <>
                  <strong>Drop a PDF, PNG or JPG here</strong>
                  <span>or paste a screenshot. It never leaves this tab.</span>
                </>
              )}
            </div>
            <FilePicker class="btn btn--shadow dropzone__btn">Choose a file</FilePicker>
          </div>
          {error && (
            <p class="landing__error" role="alert">
              {error}
            </p>
          )}
          <ul class="ticks">
            <li>
              <CheckIcon size={18} strokeWidth={2.4} />
              No uploads, no server
            </li>
            <li>
              <CheckIcon size={18} strokeWidth={2.4} />
              Works with the Wi-Fi off
            </li>
            <li>
              <CheckIcon size={18} strokeWidth={2.4} />
              Exports flattened
            </li>
          </ul>
        </div>

        <div class="demo">
          <div class="demo__doc">
            <div class="demo__meta">
              <span>Account handover</span>
              <span>Page 1 of 1</span>
            </div>
            <div class="display demo__title">Confidential - do not forward</div>
            <div class="demo__rule" />
            <div class="demo__row">
              <span>Username</span>
              <span>m.etxeberria</span>
            </div>
            <div class="demo__row">
              <span>Password</span>
              <MosaicCanvas text="you thought this was a password?" w={300} h={22} cell={7} />
            </div>
            <div class="demo__row">
              <span>Recovery</span>
              <MosaicCanvas text="fuck off" w={96} h={22} cell={7} />
            </div>
            <div class="demo__row">
              <span>IBAN</span>
              <MosaicCanvas text="nothing to see here, nerd" w={290} h={22} cell={7} />
            </div>
            <div class="demo__row">
              <span>Door PIN</span>
              <MosaicCanvas text="lol no" w={72} h={22} cell={7} />
            </div>
            <p class="demo__foot">Hand these to nobody. Shred after reading.</p>
          </div>
          <div class="stamp demo__stamp" aria-hidden="true">
            Decoyed
          </div>
          <div class="demo__note">
            <ArrowBackIcon size={28} />
            <span>
              Run the password box through any depixelizer. It will proudly recover:{' '}
              <strong>“you thought this was a password?”</strong>
            </span>
          </div>
        </div>
      </section>

      <section id="why" class="band band--dark">
        <div class="band__inner why">
          <div class="why__head">
            <h2 class="display section-title">
              Pixelation is a <span class="why__mark">puzzle</span>, not a lock.
            </h2>
            <p class="why__lead">
              A mosaic block is just the average colour of the pixels beneath it. Render guesses in the same
              font, pixelate them the same way, keep whichever matches: that is all a depixelizer does, and
              short secrets like passwords and PINs are exactly what it is best at. DECOY takes the puzzle off
              the table. The pixels in the box come from a different sentence.
            </p>
          </div>
          <div class="compare">
            <div class="card">
              <div class="card__head">
                <h3 class="display card__title">Plain pixelation</h3>
                <span class="card__sub">what everyone does</span>
              </div>
              <div class="card__step">
                <span class="label label--muted">1 · Under the box</span>
                <span class="mono-strong">Summer2026!</span>
              </div>
              <div class="card__step">
                <span class="label label--muted">2 · What you share</span>
                <MosaicCanvas text="Summer2026!" w={160} h={28} cell={7} label="Pixelated real password" />
              </div>
              <div class="card__step">
                <span class="label label--muted">3 · What they recover</span>
                <span class="card__result">
                  <span class="mono-strong">Summer2026!</span>
                  <span class="tag tag--accent">Leaked</span>
                </span>
              </div>
            </div>
            <div class="card card--decoy">
              <div class="card__head">
                <h3 class="display card__title">With DECOY</h3>
                <span class="card__sub">what you should do</span>
              </div>
              <div class="card__step">
                <span class="label label--muted">1 · Under the box</span>
                <span class="mono-strong mono-strong--struck">Summer2026!</span>
                <span class="card__sub">discarded before anything is drawn</span>
              </div>
              <div class="card__step">
                <span class="label label--muted">2 · What you share</span>
                <MosaicCanvas text="nice try, enhance harder" w={320} h={28} cell={7} />
              </div>
              <div class="card__step">
                <span class="label label--muted">3 · What they recover</span>
                <span class="card__result">
                  <span class="mono-strong">nice try, enhance harder</span>
                  <span class="tag tag--ink">Deserved</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" class="band__inner how">
        <h2 class="display section-title">Four steps. Zero uploads.</h2>
        <ol class="steps">
          {[
            [
              '01',
              'Open it here',
              'Drop a PDF, PNG or JPG, or paste a screenshot. Your browser reads it straight from disk. There is no server to send it to.',
            ],
            [
              '02',
              'Box the secret',
              'Drag over a password, an IBAN, a phone number. DECOY measures the box and works out how many characters fit in it.',
            ],
            [
              '03',
              'Pick a mood, reroll',
              'Decoys are generated to the size of the box, so the mosaic looks like it belongs there. Reroll until it is perfect, or type your own.',
            ],
            [
              '04',
              'Export it flattened',
              'The page is re-drawn as an image with the real pixels gone. No hidden text layer, no metadata, nothing left to un-blur.',
            ],
          ].map(([n, title, body]) => (
            <li key={n} class="step">
              <span class="display step__num">{n}</span>
              <h3 class="step__title">{title}</h3>
              <p class="step__body">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="moods" class="band band--paper">
        <div class="band__inner moods">
          <div class="moods__head">
            <h2 class="display section-title">Pick a mood. Reroll till it fits.</h2>
            <p class="moods__lead">
              Every decoy is built from phrase templates and trimmed to the width of your box, so the mosaic
              has the right rhythm for the line it sits on. Profanity is one switch away from off, for the
              documents your boss will see.
            </p>
          </div>
          <div class="mood-grid">
            <MoodCard
              name="Rude"
              badge={<span class="tag tag--accent">Profanity</span>}
              samples={[
                ['fuck off', 110],
                ['none of your business', 230],
              ]}
            />
            <MoodCard
              name="Smug"
              badge={<span class="tag tag--ink">Default</span>}
              samples={[
                ['you thought this was a password?', 230],
                ['enhance harder, detective', 230],
              ]}
            />
            <MoodCard
              name="Corporate"
              badge={<span class="tag tag--outline">Work-safe</span>}
              samples={[
                ['per my last email: no', 230],
                ["let's take this offline", 230],
              ]}
            />
            <MoodCard
              name="Wholesome"
              badge={<span class="tag tag--outline">Work-safe</span>}
              samples={[
                ['go drink some water', 210],
                ["you're doing great, sweetie", 230],
              ]}
            />
          </div>
        </div>
      </section>

      <section id="faq" class="band__inner faq">
        <h2 class="display section-title">Questions, asked suspiciously</h2>
        <div class="faq__list">
          <div class="faq__item">
            <h3>Does my file get uploaded?</h3>
            <p>
              No. DECOY is a static page. Files are opened with the browser’s File API, drawn onto a canvas
              and exported from that canvas. Load it once and it keeps working with the network unplugged.
            </p>
          </div>
          <div class="faq__item">
            <h3>Can anyone recover what I covered?</h3>
            <p>
              Not from the export. The box is filled from the decoy text alone, so the original pixels never
              reach the mosaic. PDFs are flattened to images, so no text layer survives underneath either.
            </p>
          </div>
          <div class="faq__item">
            <h3>Where do the insults come from?</h3>
            <p>
              Phrase templates, filled in and trimmed until they fit the box. Pick a mood, switch profanity
              off, or write your own line.
            </p>
          </div>
        </div>
      </section>

      <section class="band band--dark closing">
        <div class="band__inner closing__inner">
          <h2 class="display section-title closing__title">Keep the secret. Send the insult.</h2>
          <FilePicker class="btn btn--paper btn--shadow closing__btn">Open a file</FilePicker>
        </div>
        <footer class="band__inner footer">
          <span>DECOY runs entirely in your browser.</span>
          <span>
            © 2026 <a href="https://ggalmazor.com">Guillermo Gutierrez Almazor</a>
          </span>
          <span>
            <a href={REPO}>Source</a> · <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a> · v
            {__DECOY_VERSION__}
          </span>
        </footer>
      </section>
    </div>
  );
}

function MoodCard({
  name,
  badge,
  samples,
}: {
  name: string;
  badge: preact.ComponentChildren;
  samples: [string, number][];
}) {
  return (
    <div class="mood-card">
      <div class="mood-card__head">
        <h3 class="display mood-card__title">{name}</h3>
        {badge}
      </div>
      {samples.map(([text, w]) => (
        <div key={text} class="mood-card__sample">
          <MosaicCanvas text={text} w={w} h={24} cell={7} paper="#FFFCF4" />
          <span class="mood-card__caption">decodes to “{grawlix(text)}”</span>
        </div>
      ))}
    </div>
  );
}
