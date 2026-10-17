import { useEffect } from 'preact/hooks';
import { grawlix } from '../../core/grawlix';
import * as actions from '../actions';
import * as s from '../state';
import { ChevronDownIcon, ChevronUpIcon, DiceIcon } from '../shared/icons';
import { CanvasView } from './canvas-view';
import { ExportDialog } from './export-dialog';
import { handleEditorKey } from './keyboard';
import { Panel } from './panel';
import { StatusBar } from './statusbar';
import { Thumbnails } from './thumbnails';
import { TopBar } from './topbar';

export function Editor() {
  useEffect(() => {
    window.addEventListener('keydown', handleEditorKey);
    return () => window.removeEventListener('keydown', handleEditorKey);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (s.totalDecoys.value > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const active = s.activeDecoy.value;
  const expanded = s.sheetExpanded.value;

  return (
    <div class="editor">
      <TopBar />
      <div class="editor__body">
        <Thumbnails />
        <CanvasView />
        <div class={`sheet${expanded ? ' sheet--open' : ''}`}>
          <div class="sheet__bar">
            {active ? (
              <>
                <span class="sheet__text">{grawlix(active.text)}</span>
                <button type="button" class="icon-btn" aria-label="Reroll" onClick={actions.reroll}>
                  <DiceIcon />
                </button>
                {s.pending.value && (
                  <button type="button" class="btn btn--accent sheet__apply" onClick={actions.applyPending}>
                    Apply
                  </button>
                )}
              </>
            ) : (
              <span class="sheet__text sheet__text--muted">Drag over anything you'd rather not share.</span>
            )}
            <button
              type="button"
              class="icon-btn"
              aria-label={expanded ? 'Collapse settings' : 'Expand settings'}
              aria-expanded={expanded}
              onClick={() => (s.sheetExpanded.value = !expanded)}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
            </button>
          </div>
          <Panel />
        </div>
      </div>
      <StatusBar />
      {s.exportOpen.value && <ExportDialog />}
    </div>
  );
}
