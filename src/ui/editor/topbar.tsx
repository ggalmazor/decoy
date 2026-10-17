import { canRedo, canUndo } from '../../core/history';
import * as actions from '../actions';
import * as s from '../state';
import {
  DownloadIcon,
  LockIcon,
  MinusIcon,
  PanIcon,
  PlusIcon,
  RedoIcon,
  SelectIcon,
  UndoIcon,
} from '../shared/icons';
import { Logo } from '../shared/logo';

export function TopBar() {
  const doc = s.doc.value!;
  const pages = doc.pages.length;
  return (
    <header class="topbar">
      <Logo
        onDark
        cell={7}
        size={24}
        onClick={(e) => {
          e.preventDefault();
          if (s.totalDecoys.value === 0 || window.confirm('Close this document? Your decoys will be lost.'))
            actions.closeDocument();
        }}
      />
      <div class="topbar__doc">
        <span class="topbar__name" title={doc.name}>
          {doc.name}
        </span>
        {pages > 1 ? (
          <label class="topbar__pages">
            <span class="sr-only">Page</span>
            <select
              value={s.pageIndex.value}
              onChange={(e) => actions.goToPage(Number(e.currentTarget.value))}
            >
              {doc.pages.map((_, i) => (
                <option key={i} value={i}>
                  page {i + 1} / {pages}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span class="topbar__pages topbar__pages--static">page 1 / 1</span>
        )}
        <span class="chip">
          <LockIcon size={14} />
          local only
        </span>
      </div>
      <div class="topbar__tools" role="toolbar" aria-label="Tools">
        <button
          type="button"
          class="tool"
          aria-label="Select area"
          aria-pressed={s.tool.value === 'select'}
          onClick={() => (s.tool.value = 'select')}
        >
          <SelectIcon />
        </button>
        <button
          type="button"
          class="tool"
          aria-label="Pan"
          aria-pressed={s.tool.value === 'pan'}
          onClick={() => (s.tool.value = 'pan')}
        >
          <PanIcon />
        </button>
        <span class="tool-sep" aria-hidden="true" />
        <button
          type="button"
          class="tool"
          aria-label="Undo"
          disabled={!canUndo(s.history.value)}
          onClick={actions.undo}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          class="tool"
          aria-label="Redo"
          disabled={!canRedo(s.history.value)}
          onClick={actions.redo}
        >
          <RedoIcon />
        </button>
        <span class="tool-sep" aria-hidden="true" />
        <button type="button" class="tool" aria-label="Zoom out" onClick={actions.zoomOut}>
          <MinusIcon />
        </button>
        <button type="button" class="zoom" onClick={actions.zoomToFit} title="Fit to width">
          {Math.round(s.zoom.value * 100)}%
        </button>
        <button type="button" class="tool" aria-label="Zoom in" onClick={actions.zoomIn}>
          <PlusIcon />
        </button>
      </div>
      <button
        type="button"
        class="btn btn--accent topbar__export"
        onClick={() => (s.exportOpen.value = true)}
      >
        <DownloadIcon size={18} strokeWidth={2.2} />
        Export
      </button>
    </header>
  );
}
