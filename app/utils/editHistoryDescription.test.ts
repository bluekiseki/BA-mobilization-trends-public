import { beforeAll, describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import ui from '~/locales/ko/ui.json';
import { snapshot, type HistoryEntry } from '~/store/history/history';
import { describeHistoryEntry, type HistoryNames } from './editHistoryDescription';

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init({ lng: 'ko', resources: { ko: { ui } } });
});
const names: HistoryNames = {
  students: { '1': { Name: '유우카' }, '2': { Name: '아리스' } },
  icons: {
    Item: {},
    Equipment: {},
    Currency: {
      '1': { TagsStr: [], Rarity: 0, LocalizeEtc: { NameKr: '크레딧 포인트', NameEn: '', NameJp: '', NameTw: '', DescriptionEn: '', DescriptionJp: '', DescriptionKr: '', DescriptionTw: '' } },
    },
  },
  events: { '850': { Name: '', Kr: '이벤트 이름', Jp: '', En: null, Tw: null, OpenTime: '', CloseTime: '' } },
};
const entry = (key: string, before: unknown, after: unknown): HistoryEntry => ({ label: key, changes: [{ key, before: snapshot(before), after: snapshot(after) }] });
const describeEntry = (value: HistoryEntry, catalog: HistoryNames | null = names) => describeHistoryEntry(value, catalog, 'ko', i18n.t);

describe('history descriptions', () => {
  it('names only changed students and distinguishes additions, removals and edits', () => {
    expect(
      describeEntry(
        entry(
          'growthPlans',
          {
            growthPlans: [
              { uuid: 'a', studentId: 1, target: { level: 80 } },
              { uuid: 'b', studentId: 2 },
            ],
          },
          {
            growthPlans: [
              { uuid: 'a', studentId: 1, target: { level: 90 } },
              { uuid: 'c', studentId: 2 },
            ],
          },
        ),
      ),
    ).toEqual(['유우카 · 목표 레벨 80 → 90', '아리스 계획 삭제', '아리스 계획 추가']);
  });

  it('shows stock changes including removing the last owned item', () => {
    expect(describeEntry(entry('growthPlans', { ownedGifts: { '1': 5 } }, { ownedGifts: {} }))).toEqual(['Item_1 5 → 0']);
  });

  it('resolves rerun event names and identifies the edited field', () => {
    expect(describeEntry(entry('eventPlans:10850', { purchaseCounts: {} }, { purchaseCounts: { '1': 2 } }))).toEqual(['이벤트 이름 · 구매 수량 변경']);
  });

  it('names currencies used by resource purchases and students with changed goals', () => {
    expect(
      describeEntry(
        entry(
          'resourcePlan',
          { kr: { purchaseEvents: [], targetGoals: {} } },
          { kr: { purchaseEvents: [{ id: 'a', gainItemKey: 'Currency_1', gainAmount: 1000 }], targetGoals: { '1': [{ id: 'g' }] } } },
        ),
      ),
    ).toEqual(['GL · 크레딧 포인트 0 → 1,000', 'GL · 유우카 계획 추가']);
  });

  it('keeps useful fallback labels when catalogs are unavailable', () => {
    expect(describeEntry(entry('growthPlans', undefined, { growthPlans: [{ uuid: 'a', studentId: 1 }] }), null)).toEqual(['학생 1 계획 추가']);
    expect(describeEntry(entry('equipmentPlan', {}, { farmingDays: 2 }), null)).toEqual(['파밍 일수 변경']);
  });

  it('describes equipment and recruitment settings using the same field formatter', () => {
    expect(describeEntry(entry('equipmentPlan', { farmingDays: 1, normalMultiplier: 2 }, { farmingDays: 7, normalMultiplier: 3 }))).toEqual(['파밍 일수 1 → 7', '일반 보상 배수 2 → 3']);
    expect(describeEntry(entry('gacha_prefs', { incomeConfig: { currentPyroxene: 1000 } }, { incomeConfig: { currentPyroxene: 2000 } }))).toEqual(['모집 설정 · 수입 설정 보유 청휘석 1,000 → 2,000']);
  });

  it('names students when recruitment strategies or results change', () => {
    expect(describeEntry(entry('gacha_strategies', { a: { studentConfigs: { '1': { mode: 'skip' } } } }, { a: { studentConfigs: { '1': { mode: 'must' } } } }))).toEqual([
      '유우카 · 모집 계획 · 모집 방식 건너뛰기 → 필수 모집',
    ]);
    expect(describeEntry(entry('gachaHistory', { entries: [] }, { entries: [{ id: 'a', date: '2026-11-16', results: [{ id: 'r', studentId: 1 }] }] }))).toEqual([
      '2026-11-16 · 모집 기록 추가',
      '유우카 · 모집 기록 추가',
    ]);
  });

  it('identifies raid record edits by date and changed value', () => {
    expect(describeEntry(entry('raidHistory', { entries: [{ id: 'a', date: '2026-11-16', score: 1000 }] }, { entries: [{ id: 'a', date: '2026-11-16', score: 2000 }] }))).toEqual([
      '2026-11-16 · 총력전 기록 · 점수 1,000 → 2,000',
    ]);
  });

  it('describes event bonus selections by student name', () => {
    expect(describeEntry(entry('eventPlans:10850', { selectedStudents: ['1'] }, { selectedStudents: ['2'] }))).toEqual([
      '이벤트 이름 · 보너스 학생 · 유우카 삭제',
      '이벤트 이름 · 보너스 학생 · 아리스 추가',
    ]);
  });
});
