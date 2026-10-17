import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { grawlix } from '../../core/grawlix';
import {
  copyPageToClipboard,
  exportPdf,
  exportPng,
  flattenPage,
  type ExportFormat,
  type ExportOptions,
} from '../../doc/export';
import * as s from '../state';
import { CloseIcon, DownloadIcon } from '../shared/icons';
import { MosaicCanvas } from '../shared/mosaic-canvas';

function Preview({ options }: { options: ExportOptions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const page = s.currentPage.value;
  const decoys = s.currentDecoys.value;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !page) return;
    const flat = flattenPage(page, decoys, options);
    const maxW = 440;
    const maxH = 520;
    const scale = Math.min(maxW / flat.width, maxH / flat.height, 1);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(flat.width * scale * dpr);
    canvas.height = Math.round(flat.height * scale * dpr);
    canvas.style.width = `${Math.round(flat.width * scale)}px`;
    canvas.style.height = `${Math.round(flat.height * scale)}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(flat, 0, 0, canvas.width, canvas.height);
  }, [page, decoys, options]);
  return (
    <canvas
      ref={ref}
      class="export__preview-canvas"
      role="img"
      aria-label="Flattened preview of the current page"
    />
  );
}

export function ExportDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const doc = s.doc.value!;
  const format = useSignal<ExportFormat>(doc.kind === 'pdf' ? 'pdf' : 'png');
  const strip = useSignal(true);
  const watermark = useSignal(false);
  const busy = useSignal(false);
  const confirmEmpty = useSignal(false);
  const clipboardOk = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onClose = () => (s.exportOpen.value = false);
    el.addEventListener('close', onClose);
    return () => el.removeEventListener('close', onClose);
  }, []);

  const options: ExportOptions = { stripMetadata: strip.value, watermark: watermark.value };
  const page = s.currentPage.value!;
  const decoys = s.currentDecoys.value;
  const all = s.decoyPages.value.flat();
  const total = s.totalDecoys.value;

  const run = async () => {
    if (total === 0 && !confirmEmpty.value) {
      confirmEmpty.value = true;
      return;
    }
    busy.value = true;
    try {
      if (format.value === 'pdf') {
        await exportPdf(doc, s.decoyPages.value, options);
        s.showToast('Leaked responsibly.');
      } else if (format.value === 'png') {
        await exportPng(doc, s.decoyPages.value, options);
        s.showToast('Leaked responsibly.');
      } else {
        await copyPageToClipboard(page, decoys, options);
        s.showToast('Copied. Paste with confidence.');
      }
      dialog.current?.close();
    } catch (error) {
      s.showToast(error instanceof Error ? error.message : 'Export failed.', 4000);
    } finally {
      busy.value = false;
    }
  };

  const primary =
    format.value === 'pdf' ? 'Download PDF' : format.value === 'png' ? 'Download PNG' : 'Copy to clipboard';

  return (
    <dialog
      ref={dialog}
      class="export"
      aria-labelledby="export-title"
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div class="export__body">
        <button
          type="button"
          class="icon-btn export__close"
          aria-label="Close"
          onClick={() => dialog.current?.close()}
        >
          <CloseIcon size={22} strokeWidth={2.2} />
        </button>
        <div class="export__left">
          <div class="export__paper">
            <Preview options={options} />
            <span class="stamp stamp--flattened" aria-hidden="true">
              Flattened
            </span>
          </div>
          <span class="export__caption">
            Page {s.pageIndex.value + 1} of {doc.pages.length} · {decoys.length}{' '}
            {decoys.length === 1 ? 'decoy' : 'decoys'} · {page.width} × {page.height} px
          </span>
        </div>
        <div class="export__right">
          <div class="export__intro">
            <h2 id="export-title" class="display export__title">
              Ready to leak
            </h2>
            <p>Every page is re-drawn as an image. The real text under the boxes is gone, not hidden.</p>
          </div>

          <fieldset class="field">
            <legend class="label">Format</legend>
            <div class="formats">
              <label class={`format${format.value === 'pdf' ? ' format--on' : ''}`}>
                <input
                  type="radio"
                  name="fmt"
                  value="pdf"
                  checked={format.value === 'pdf'}
                  onChange={() => (format.value = 'pdf')}
                />
                <span>
                  <strong>PDF</strong>
                  <small>
                    flattened, {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
                  </small>
                </span>
              </label>
              <label class={`format${format.value === 'png' ? ' format--on' : ''}`}>
                <input
                  type="radio"
                  name="fmt"
                  value="png"
                  checked={format.value === 'png'}
                  onChange={() => (format.value = 'png')}
                />
                <span>
                  <strong>PNG</strong>
                  <small>one per page</small>
                </span>
              </label>
              <label
                class={`format${format.value === 'clipboard' ? ' format--on' : ''}${clipboardOk ? '' : ' format--off'}`}
              >
                <input
                  type="radio"
                  name="fmt"
                  value="clipboard"
                  disabled={!clipboardOk}
                  checked={format.value === 'clipboard'}
                  onChange={() => (format.value = 'clipboard')}
                />
                <span>
                  <strong>Clipboard</strong>
                  <small>current page</small>
                </span>
              </label>
            </div>
          </fieldset>

          <div class="export__options">
            <label class="check">
              <input
                type="checkbox"
                checked={strip.value}
                onChange={(e) => (strip.value = e.currentTarget.checked)}
              />
              <span>Strip metadata (author, software, EXIF)</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                checked={watermark.value}
                onChange={(e) => (watermark.value = e.currentTarget.checked)}
              />
              <span>Add a tiny “decoyed” watermark</span>
            </label>
          </div>

          <div class="enhance">
            <div class="enhance__head">
              <span>Enhance test</span>
              <span class="enhance__sub">what a depixelizer would get</span>
            </div>
            {all.length === 0 && (
              <div class="enhance__row enhance__row--empty">
                No decoys yet. Nothing to recover, and nothing hidden either.
              </div>
            )}
            {all.map((d) => (
              <div key={d.id} class="enhance__row">
                <MosaicCanvas text={d.text} w={150} h={18} cell={6} ink={d.ink} paper={d.paper} />
                <span aria-hidden="true">→</span>
                <span class="enhance__phrase">{grawlix(d.text)}</span>
              </div>
            ))}
          </div>

          {confirmEmpty.value && total === 0 && (
            <p class="export__warn">You haven't covered anything yet. Export anyway?</p>
          )}

          <div class="export__actions">
            <button
              type="button"
              class="btn btn--shadow export__primary"
              disabled={busy.value}
              onClick={() => void run()}
            >
              <DownloadIcon size={18} strokeWidth={2.2} />
              {busy.value ? 'Working…' : confirmEmpty.value && total === 0 ? `${primary} anyway` : primary}
            </button>
            <button type="button" class="link-btn export__back" onClick={() => dialog.current?.close()}>
              Back to editing
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
