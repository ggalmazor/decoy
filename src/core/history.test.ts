import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, push, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes snapshots', () => {
    let h = createHistory(0);
    h = push(h, 1);
    h = push(h, 2);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(2);
    h = undo(undo(undo(h)));
    expect(h.present).toBe(0);
  });

  it('coalesces consecutive pushes with the same key', () => {
    let h = createHistory('');
    h = push(h, 'a', 'typing');
    h = push(h, 'ab', 'typing');
    h = push(h, 'abc', 'typing');
    expect(h.past).toEqual(['']);
    h = push(h, 'abc!', 'other');
    expect(h.past).toEqual(['', 'abc']);
    expect(undo(h).present).toBe('abc');
  });

  it('a new push clears the redo stack', () => {
    let h = createHistory(0);
    h = push(h, 1);
    h = undo(h);
    h = push(h, 5);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(5);
  });
});
