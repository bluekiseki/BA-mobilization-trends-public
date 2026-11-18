// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditHistory, snapshot, snapshotValue } from './history';
import { watchHistoryInteractions } from './interactions';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function setup(markup: string) {
  document.body.innerHTML = markup;
  const history = new EditHistory();
  history.seed('plan', snapshot(0));
  stop = watchHistoryInteractions(history, document);
  const change = (value: number) => {
    history.observe('plan', snapshot(value));
    history.commit();
  };
  return { history, change };
}

function pointer(node: EventTarget, type: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  node.dispatchEvent(event);
}

function control(selector: string) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing test control: ${selector}`);
  return node;
}

describe('history interaction boundaries', () => {
  it('groups repeated step-button clicks and separates other controls', () => {
    const { history, change } = setup('<button id="plus" data-history-repeat>+</button><button id="minus" data-history-repeat>-</button><button id="other">Other</button>');
    const click = (id: string, value: number) => {
      const button = control(`#${id}`);
      pointer(button, 'pointerdown');
      pointer(button, 'pointerup');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      change(value);
    };
    for (let value = 1; value <= 100; value++) click('plus', value);
    expect(history.entries).toHaveLength(1);
    expect(snapshotValue(history.entries[0].changes[0].before)).toBe(0);
    expect(snapshotValue(history.entries[0].changes[0].after)).toBe(100);
    click('minus', 99);
    click('minus', 98);
    expect(history.entries).toHaveLength(2);
    pointer(control('#other'), 'pointerdown');
    click('minus', 97);
    expect(history.entries).toHaveLength(3);
    let result: unknown;
    history.replay(
      'undo',
      (_key, value) => {
        result = value;
      },
      () => undefined,
    );
    expect(result).toBe(98);
    history.replay(
      'undo',
      (_key, value) => {
        result = value;
      },
      () => undefined,
    );
    expect(result).toBe(100);
  });

  it('groups held arrow keys in custom number editors without native input events', () => {
    const { history, change } = setup('<input type="text" inputmode="numeric">');
    const input = control('input');
    for (let value = 1; value <= 100; value++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', repeat: value > 1, bubbles: true }));
      change(value);
    }
    expect(history.entries).toHaveLength(1);
    expect(snapshotValue(history.entries[0].changes[0].before)).toBe(0);
    expect(snapshotValue(history.entries[0].changes[0].after)).toBe(100);
    input.dispatchEvent(new FocusEvent('blur'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    change(99);
    expect(history.entries).toHaveLength(2);
    let result: unknown;
    history.replay(
      'undo',
      (_key, value) => {
        result = value;
      },
      () => undefined,
    );
    expect(result).toBe(100);
    history.replay(
      'undo',
      (_key, value) => {
        result = value;
      },
      () => undefined,
    );
    expect(result).toBe(0);
  });

  it('keeps slow typing in one step and starts another after Enter or blur', () => {
    vi.useFakeTimers();
    const { history, change } = setup('<input type="number">');
    const input = control('input');
    const edit = (value: number) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      change(value);
    };
    edit(1);
    vi.advanceTimersByTime(5000);
    edit(12);
    expect(history.entries).toHaveLength(1);
    expect(snapshotValue(history.entries[0].changes[0].before)).toBe(0);
    expect(snapshotValue(history.entries[0].changes[0].after)).toBe(12);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    edit(123);
    input.dispatchEvent(new FocusEvent('blur'));
    edit(1234);
    expect(history.entries).toHaveLength(3);
  });

  it('groups custom slider updates by drag and preserves undo and redo', () => {
    const { history, change } = setup('<div class="rc-slider"><div role="slider" tabindex="0"></div></div>');
    const handle = control('[role="slider"]');
    pointer(handle, 'pointerdown');
    for (let value = 1; value <= 100; value++) change(value);
    pointer(window, 'pointerup');
    pointer(handle, 'pointerdown');
    change(101);
    change(102);
    pointer(window, 'pointerup');
    expect(history.entries).toHaveLength(2);
    let result: unknown;
    const apply = (_key: string, value: unknown) => {
      result = value;
    };
    history.replay('undo', apply, () => undefined);
    expect(result).toBe(100);
    history.replay('undo', apply, () => undefined);
    expect(result).toBe(0);
    history.replay('redo', apply, () => undefined);
    expect(result).toBe(100);
  });

  it('separates input controls and keeps a return to the starting value out of history', () => {
    const { history, change } = setup('<input id="first"><input id="second">');
    const edit = (id: string, value: number) => {
      control(`#${id}`).dispatchEvent(new Event('input', { bubbles: true }));
      change(value);
    };
    edit('first', 1);
    edit('second', 2);
    edit('second', 1);
    expect(history.entries).toHaveLength(1);
    edit('second', 3);
    expect(history.entries).toHaveLength(2);
    expect(snapshotValue(history.entries[1].changes[0].before)).toBe(1);
  });
});
