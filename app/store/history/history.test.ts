import { describe, expect, it } from 'vitest';
import { EditHistory, eventEditSnapshot, snapshot } from './history';

describe('history retention', () => {
  it('drops the oldest steps when the count limit is exceeded', () => {
    const history = new EditHistory(2);
    history.seed('plan', snapshot(0));
    for (const value of [1, 2, 3]) {
      history.observe('plan', snapshot(value));
      history.commit();
    }
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].changes[0].before).toEqual(snapshot(1));
    expect(history.cursor).toBe(2);
  });

  it('bounds retained bytes and removes a step that cannot fit by itself', () => {
    const history = new EditHistory(30, 500);
    history.seed('plan', snapshot(''));
    for (const value of ['a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50)]) {
      history.observe('plan', snapshot(value));
      history.commit();
    }
    expect(history.entries.length).toBeLessThan(3);
    expect(history.bytes).toBeLessThanOrEqual(500);
    history.observe('plan', snapshot('x'.repeat(500)));
    history.commit();
    expect(history.entries).toHaveLength(0);
    expect(history.warning).toBe('tooLarge');
    expect(history.current.get('plan')).toEqual(snapshot('x'.repeat(500)));
  });
});

describe('event edit history', () => {
  it('keeps consecutive undo and redo steps when totals recalculate after each replay', () => {
    const history = new EditHistory();
    const key = 'eventPlans:1';
    let plan: Record<string, unknown> = { selectedStudents: [] };
    const observe = () => history.observe(key, eventEditSnapshot(plan));
    const calculate = () => {
      plan = { ...plan, cachedTotalItems: { savedAt: Date.now(), gained: {}, spent: {}, availableAp: 100 } };
      observe();
      history.commit();
    };
    history.seed(key, eventEditSnapshot(plan));
    for (const student of ['1', '2', '3']) {
      plan = { ...plan, selectedStudents: [student] };
      observe();
      history.commit();
      calculate();
    }
    const replay = (direction: 'undo' | 'redo') => {
      history.replay(
        direction,
        (_key, value) =>
          history.external(() => {
            plan = value as Record<string, unknown>;
            observe();
          }),
        () => undefined,
      );
      calculate();
    };
    replay('undo');
    expect(history.cursor).toBe(2);
    replay('undo');
    expect(history.cursor).toBe(1);
    replay('undo');
    expect(history.cursor).toBe(0);
    expect(plan.selectedStudents).toEqual([]);
    expect(history.entries).toHaveLength(3);
    for (let index = 0; index < 3; index++) replay('redo');
    expect(plan.selectedStudents).toEqual(['3']);
    expect(history.cursor).toBe(3);
  });

  it('does not record cache-only plans or invalidate redo after clearing a plan', () => {
    const history = new EditHistory();
    const key = 'eventPlans:1';
    history.seed(key, snapshot(undefined));
    history.observe(key, eventEditSnapshot({ selectedStudents: ['1'] }));
    history.commit();
    history.replay(
      'undo',
      () => undefined,
      () => undefined,
    );
    history.observe(key, eventEditSnapshot({ cachedTotalItems: { savedAt: 123 } }));
    history.commit();
    expect(history.cursor).toBe(0);
    expect(history.entries).toHaveLength(1);
    history.replay(
      'redo',
      () => undefined,
      () => undefined,
    );
    expect(history.cursor).toBe(1);
  });
});
