import { useComputed } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { FIT_LABELS, fitStatus } from '../../core/fit';
import { grawlix } from '../../core/grawlix';
import { MAX_CELL, MIN_CELL } from '../../core/mosaic';
import { MOOD_LABELS, MOODS } from '../../core/phrases';
import * as actions from '../actions';
import * as s from '../state';
import { DiceIcon, LockIcon, TrashIcon, UnlockIcon } from '../shared/icons';

function ColourSwatch({
  label,
  value,
  sampled,
  onChange,
}: {
  label: string;
  value: string;
  sampled: boolean;
  onChange: (hex: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <button type="button" class="swatch" onClick={() => input.current?.click()}>
      <span class="swatch__chip" aria-hidden="true" style={{ background: value }} />
      <span>
        {label} · {sampled ? 'sampled' : value.toUpperCase()}
      </span>
      <input
        ref={input}
        type="color"
        class="sr-only"
        tabIndex={-1}
        value={value}
        aria-label={`${label} colour`}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
    </button>
  );
}

export function Panel() {
  const active = s.activeDecoy.value;
  const pendingNow = s.activeIsPending.value;
  const alternatives = useComputed(() =>
    s.activeDecoy.value ? actions.alternativesFor(s.activeDecoy.value) : [],
  );
  const ratio = active ? actions.ratioFor(active) : 0;
  const status = fitStatus(ratio);
  const decoys = s.currentDecoys.value;

  return (
    <aside class="panel" aria-label="Decoy settings">
      <div class="panel__head">
        <h2 class="display panel__title">Decoy</h2>
        {active ? (
          <span class="tag tag--ink">
            Area {s.activeIndex.value}
            {pendingNow ? ' · new' : ''}
          </span>
        ) : (
          <span class="tag tag--outline">
            {decoys.length === 0 ? 'No decoys' : `${decoys.length} on page`}
          </span>
        )}
      </div>

      {!active && (
        <div class="panel__empty">
          <p class="panel__empty-lead">Drag over anything you'd rather not share.</p>
          <p class="panel__empty-tip">
            Tip: click a decoy to edit it. Shift-drag the arrow keys to nudge it by 10.
          </p>
        </div>
      )}

      {active && (
        <>
          <dl class="stats">
            <div>
              <dt class="label label--xs label--muted">Width</dt>
              <dd>{active.rect.w} px</dd>
            </div>
            <div>
              <dt class="label label--xs label--muted">Height</dt>
              <dd>{active.rect.h} px</dd>
            </div>
            <div>
              <dt class="label label--xs label--muted">Fits</dt>
              <dd>~{actions.capacityOf(active)} chars</dd>
            </div>
          </dl>

          <fieldset class="field">
            <legend class="label">Mood</legend>
            <div class="segmented" role="group" aria-label="Mood">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active.mood === m}
                  onClick={() => actions.setMood(m)}
                >
                  {MOOD_LABELS[m]}
                </button>
              ))}
            </div>
            <label class="check">
              <input
                type="checkbox"
                checked={active.clean}
                onChange={(e) => actions.setClean(e.currentTarget.checked)}
              />
              <span>Keep it clean (no profanity)</span>
            </label>
          </fieldset>

          <div class="field">
            <label class="label" for="decoy-text">
              Decoy text
            </label>
            <input
              id="decoy-text"
              class="decoy-input"
              type="text"
              value={active.text}
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => actions.setText(e.currentTarget.value)}
            />
            <div class="meter">
              <div class="meter__track" aria-hidden="true">
                <span class="meter__fill" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
              </div>
              <div class="meter__row">
                <span>
                  {active.text.length} / {actions.capacityOf(active)} characters
                </span>
                <span class={`meter__status meter__status--${status}`}>{FIT_LABELS[status]}</span>
              </div>
            </div>
            <div class="button-row">
              <button type="button" class="btn" onClick={actions.reroll}>
                <DiceIcon size={18} />
                Reroll
              </button>
              <button
                type="button"
                class="btn btn--outline"
                aria-pressed={active.locked}
                onClick={actions.toggleLock}
              >
                {active.locked ? <LockIcon size={18} /> : <UnlockIcon size={18} />}
                {active.locked ? 'Locked' : 'Lock'}
              </button>
            </div>
          </div>

          {alternatives.value.length > 0 && (
            <div class="field">
              <h3 class="label">Also fits</h3>
              <div class="alternatives">
                {alternatives.value.map((text) => (
                  <button
                    key={text}
                    type="button"
                    class="alternative"
                    onClick={() => actions.pickAlternative(text)}
                  >
                    <span>{grawlix(text)}</span>
                    <span class="alternative__count">{text.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div class="field">
            <h3 class="label">Mosaic</h3>
            <label class="range">
              <span class="range__row">
                <span>Block size</span>
                <span class="range__value">{active.cell} px</span>
              </span>
              <input
                type="range"
                min={MIN_CELL}
                max={MAX_CELL}
                step={1}
                value={active.cell}
                onInput={(e) => actions.setCell(Number(e.currentTarget.value))}
              />
            </label>
            <div class="swatches">
              <ColourSwatch
                label="Ink"
                value={active.ink}
                sampled={active.inkSampled}
                onChange={actions.setInk}
              />
              <ColourSwatch
                label="Paper"
                value={active.paper}
                sampled={active.paperSampled}
                onChange={actions.setPaper}
              />
            </div>
            {(!active.inkSampled || !active.paperSampled) && (
              <button type="button" class="link-btn" onClick={actions.resampleColours}>
                Sample both again
              </button>
            )}
          </div>

          <div class="button-row button-row--apply">
            {pendingNow ? (
              <>
                <button type="button" class="btn btn--accent btn--apply" onClick={actions.applyPending}>
                  Apply decoy
                </button>
                <button type="button" class="btn btn--outline" onClick={actions.cancelPending}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" class="btn btn--apply" onClick={() => actions.selectDecoy(null)}>
                  Done
                </button>
                <button type="button" class="btn btn--outline" onClick={() => actions.removeDecoy(active.id)}>
                  Remove
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div class="on-page">
        <h3 class="label">On this page</h3>
        {decoys.length === 0 && <p class="on-page__empty">Nothing covered yet.</p>}
        {decoys.map((decoy, i) => (
          <div
            key={decoy.id}
            class={`on-page__row${decoy.id === s.editingId.value ? ' on-page__row--active' : ''}`}
          >
            <span class="decoy-badge decoy-badge--static" aria-hidden="true">
              {i + 1}
            </span>
            <button type="button" class="on-page__pick" onClick={() => actions.selectDecoy(decoy.id)}>
              <span class="on-page__label">
                Area {i + 1} · {decoy.rect.w} × {decoy.rect.h}
              </span>
              <span class="on-page__text">{grawlix(decoy.text)}</span>
            </button>
            <button
              type="button"
              class="icon-btn"
              aria-label={`Remove decoy ${i + 1}`}
              onClick={() => actions.removeDecoy(decoy.id)}
            >
              <TrashIcon size={18} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
