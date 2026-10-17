import { useEffect } from 'preact/hooks';
import { imageFromClipboard } from '../doc/load';
import * as actions from './actions';
import * as s from './state';
import { Editor } from './editor/editor';
import { Landing } from './landing/landing';
import '../styles/landing.css';
import '../styles/editor.css';
import '../styles/export.css';

export function App() {
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      s.dragOver.value = true;
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) s.dragOver.value = false;
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      s.dragOver.value = false;
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      void actions.openFile(file);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (s.exportOpen.value) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const file = imageFromClipboard(e);
      if (!file) return;
      e.preventDefault();
      void actions.openFile(file, file.name || 'pasted-screenshot.png');
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return (
    <>
      {s.view.value === 'editor' ? <Editor /> : <Landing />}
      {s.loading.value && (
        <div class="loading" role="status" aria-live="polite">
          <span class="loading__box">
            {s.loading.value.total > 0
              ? `Rendering page ${s.loading.value.page} of ${s.loading.value.total}…`
              : 'Opening…'}
          </span>
        </div>
      )}
      {s.toast.value && (
        <div class="toast" role="status" aria-live="polite">
          {s.toast.value}
        </div>
      )}
    </>
  );
}
