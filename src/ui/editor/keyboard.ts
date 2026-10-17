import * as actions from '../actions';
import * as s from '../state';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function handleEditorKey(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey;
  if (meta && event.key.toLowerCase() === 'z') {
    if (isTyping(event.target) && !s.activeDecoy.value) return;
    event.preventDefault();
    if (event.shiftKey) actions.redo();
    else actions.undo();
    return;
  }
  if (isTyping(event.target)) {
    if (event.key === 'Enter' && s.pending.value) {
      event.preventDefault();
      actions.applyPending();
    } else if (event.key === 'Escape') {
      (event.target as HTMLElement).blur();
    }
    return;
  }
  if (s.exportOpen.value) return;
  const step = event.shiftKey ? 10 : 1;
  switch (event.key) {
    case 'Enter':
      if (s.pending.value) {
        event.preventDefault();
        actions.applyPending();
      }
      break;
    case 'Escape':
      if (s.pending.value) actions.cancelPending();
      else actions.selectDecoy(null);
      break;
    case 'r':
    case 'R':
      if (!meta && s.activeDecoy.value) {
        event.preventDefault();
        actions.reroll();
      }
      break;
    case 'Delete':
    case 'Backspace':
      if (s.activeDecoy.value) {
        event.preventDefault();
        actions.removeActive();
      }
      break;
    case 'ArrowLeft':
      if (s.activeDecoy.value) {
        event.preventDefault();
        actions.nudgeActive(-step, 0);
      }
      break;
    case 'ArrowRight':
      if (s.activeDecoy.value) {
        event.preventDefault();
        actions.nudgeActive(step, 0);
      }
      break;
    case 'ArrowUp':
      if (s.activeDecoy.value) {
        event.preventDefault();
        actions.nudgeActive(0, -step);
      }
      break;
    case 'ArrowDown':
      if (s.activeDecoy.value) {
        event.preventDefault();
        actions.nudgeActive(0, step);
      }
      break;
    case 'v':
    case 'V':
      if (!meta) s.tool.value = 'select';
      break;
    case 'h':
    case 'H':
      if (!meta) s.tool.value = 'pan';
      break;
    case '=':
    case '+':
      if (meta) {
        event.preventDefault();
        actions.zoomIn();
      }
      break;
    case '-':
      if (meta) {
        event.preventDefault();
        actions.zoomOut();
      }
      break;
    case '0':
      if (meta) {
        event.preventDefault();
        actions.zoomToFit();
      }
      break;
    default:
      break;
  }
}
