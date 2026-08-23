// app/routes/planner/Inventory.tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds, getStudentsUsingMaterial } from '~/utils/calculatedGrowthNeeds';
import { equipmentId } from '~/data/growthData';
import { BD_NOTE_GRADE_LABEL, BD_NOTE_SCHOOL_ORDER, getBdNoteItemKey, type BdNoteGrade } from '~/utils/bdNoteSchool';
import {
  buildResourceEntries,
  buildStudentResourceGroups,
  getDisplayAmount,
  isStudentElephKey,
  MATRIX_CAPABLE_TYPES,
  SHOP_CATEGORY_LABEL,
  sortResourceEntries,
  type DisplayMode,
  type SortKey,
} from '~/utils/inventoryDashboard';
import { splitItemKey, type ItemType } from '~/utils/itemType';
import { getItemDescription, getItemName } from '~/components/planner/common/locale';
import { ItemIcon } from '~/components/planner/common/Icon';
import { buildGiftToStudentsMap, filterGiftStudentsForDisplay } from '~/components/planner/StudentGrowth/GiftStudentSheet';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { EventData, IconData, IconInfos, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Route } from './+types/Inventory';
import { GroupedSections } from '~/components/common/GroupedSections';
import { StudentIcon } from '~/components/dashboard/studentIcon';
import type { Character } from '~/components/dashboard/common';
import { InventoryFilterBar } from '~/components/planner/inventory/InventoryFilterBar';
import { ResourceGrid } from '~/components/planner/inventory/ResourceGrid';
import { ResourceMatrix, type MatrixAxisEntry } from '~/components/planner/inventory/ResourceMatrix';
import { QuantityEditSheet } from '~/components/planner/inventory/QuantityEditSheet';
import { useResourceIconSize } from '~/components/planner/inventory/ResourceIconButton';

const EQUIP_CATEGORIES = ['Hat', 'Gloves', 'Shoes', 'Bag', 'Badge', 'Hairpin', 'Charm', 'Watch', 'Necklace'] as const;
const BD_NOTE_GRADES: BdNoteGrade[] = [0, 1, 2, 3];

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:inventory.title'),
    description: i18n.t('planner:inventory.description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/inventory')];
}

export default function InventoryPage({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  const { t: t_club } = useTranslation('club', { keyPrefix: 'short' });
  const { t: t_game } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_planner } = useTranslation('planner');
  const iconSize = useResourceIconSize();
  const matcher = useSearchMatcher(locale);

  const [students, setStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfos, setIconInfos] = useState<IconInfos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsRes, portraitsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json')),
          fetch(cdn('/ew/icon_img.json')),
          fetch(cdn('/ew/icon_info.json')),
        ]);
        setStudents(await studentsRes.json());
        setStudentPortraits(await portraitsRes.json());
        setIconData(await iconImgRes.json());
        setIconInfos(await iconInfoRes.json());
      } catch (error) {
        console.error('Failed to fetch inventory data:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [locale]);

  const { growthPlans, materialInventory, updateMaterialInventory, togglePlanSelection, selectAllPlans } = useGlobalStore();

  const [selectedTypes, setSelectedTypes] = useState<Set<ItemType>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('type');
  const [showTarget, setShowTarget] = useState(false);
  const [onlyNonZero, setOnlyNonZero] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [groupByStudent, setGroupByStudent] = useState(false);

  const [displayMode, setDisplayMode] = useState<DisplayMode>('owned');

  const handleToggleShowTarget = (v: boolean) => {
    setShowTarget(v);
    if (!v) {
      setDisplayMode('owned'); // needed/diff/deficit modes are meaningless without target data
      setGroupByStudent(false); // grouping needs per-student target data too
    }
  };
  // Grouped and matrix are alternate views of the same filtered list — mutually exclusive.
  const handleToggleGroupByStudent = () => {
    setGroupByStudent((v) => !v);
    setShowMatrix(false);
  };
  const handleToggleMatrix = () => {
    setShowMatrix((v) => !v);
    setGroupByStudent(false);
  };
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<Student['TacticRole']>>(new Set());
  const [selectedSquads, setSelectedSquads] = useState<Set<Student['SquadType']>>(new Set());
  const [selectedShopCategories, setSelectedShopCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedRarities, setSelectedRarities] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const EQUIP_LABELS: Record<(typeof EQUIP_CATEGORIES)[number], string> = {
    Hat: t_game('equipments.hat'),
    Gloves: t_game('equipments.gloves'),
    Shoes: t_game('equipments.shoes'),
    Bag: t_game('equipments.bag'),
    Badge: t_game('equipments.badge'),
    Hairpin: t_game('equipments.hairpin'),
    Charm: t_game('equipments.charm'),
    Watch: t_game('equipments.watch'),
    Necklace: t_game('equipments.necklace'),
  };

  // Matrix view only makes sense when narrowed to exactly one matrix-capable type.
  const singleMatrixType = selectedTypes.size === 1 ? [...selectedTypes].find((t) => MATRIX_CAPABLE_TYPES.has(t)) : undefined;

  const needed = useMemo(() => {
    if (!showTarget) return {};
    const activePlans = growthPlans.filter((p) => p.isSelected);
    return calculatedGrowthNeeds(activePlans, students);
  }, [showTarget, growthPlans, students]);

  const entries = useMemo(() => {
    if (!iconInfos) return [];
    return buildResourceEntries(iconInfos, materialInventory, needed, students, locale);
  }, [iconInfos, materialInventory, needed, students, locale]);

  // Applies every active filter except `exclude`, so each filter's option list only hides
  // zero-match values under the *other* filters, not its own selection.
  type FilterKey = 'types' | 'schools' | 'roles' | 'squads' | 'shopCategories' | 'tags' | 'rarities';
  const applyFilters = (source: typeof entries, exclude: FilterKey | null) => {
    let base = source;
    if (exclude !== 'types' && selectedTypes.size > 0) base = base.filter((e) => selectedTypes.has(e.itemType));
    if (exclude !== 'schools' && selectedSchools.size > 0) base = base.filter((e) => e.school === null || selectedSchools.has(e.school));
    if (exclude !== 'roles' && selectedRoles.size > 0) base = base.filter((e) => e.tacticRole === null || selectedRoles.has(e.tacticRole));
    if (exclude !== 'squads' && selectedSquads.size > 0) base = base.filter((e) => e.squadType === null || selectedSquads.has(e.squadType));
    if (exclude !== 'shopCategories' && selectedShopCategories.size > 0) {
      // Unlike school/role/squad, an empty array here just means "no categories" — it doesn't
      // bypass the filter, it simply fails to match.
      base = base.filter((e) => e.shopCategories.some((c) => selectedShopCategories.has(String(c))));
    }
    if (exclude !== 'tags' && selectedTags.size > 0) base = base.filter((e) => e.tags.some((t) => selectedTags.has(t)));
    if (exclude !== 'rarities' && selectedRarities.size > 0) base = base.filter((e) => selectedRarities.has(String(e.rarity)));
    if (onlyNonZero) base = base.filter((e) => getDisplayAmount(e.owned, e.needed, displayMode) !== 0);
    if (searchQuery.trim()) base = base.filter((e) => matcher(e.name, searchQuery.trim()));
    return base;
  };

  const filterDeps = [
    entries,
    selectedTypes,
    selectedSchools,
    selectedRoles,
    selectedSquads,
    selectedShopCategories,
    selectedTags,
    selectedRarities,
    onlyNonZero,
    displayMode,
    searchQuery,
    matcher,
  ] as const;

  const schoolOptions = useMemo(() => {
    const present = new Set<string>();
    for (const e of applyFilters(entries, 'schools')) if (e.school !== null) present.add(e.school);
    return Array.from(new Set([...present, ...selectedSchools]))
      .sort()
      .map((s) => ({ value: s, label: t_club(s, s) }));
  }, filterDeps);

  // Only show ShopCategory/Tag/rarity values that actually appear under the other active
  // filters — no fixed option list exists to fall back to.
  const shopCategoryOptions = useMemo(() => {
    const present = new Set<number>();
    for (const e of applyFilters(entries, 'shopCategories')) for (const c of e.shopCategories) present.add(c);
    return Array.from(new Set([...present, ...[...selectedShopCategories].map(Number)]))
      .sort((a, b) => a - b)
      .map((c) => ({ value: String(c), label: SHOP_CATEGORY_LABEL[c] ?? String(c) }));
  }, filterDeps);

  const tagOptions = useMemo(() => {
    const present = new Set<string>();
    for (const e of applyFilters(entries, 'tags')) for (const tag of e.tags) present.add(tag);
    return Array.from(new Set([...present, ...selectedTags]))
      .sort()
      .map((tag) => ({ value: tag, label: tag }));
  }, filterDeps);

  // Rarity is 0-based here (item/equipment rarity tier, distinct from the 1-5 student star scale).
  const rarityOptions = useMemo(() => {
    const present = new Set<number>();
    for (const e of applyFilters(entries, 'rarities')) present.add(e.rarity);
    return Array.from(new Set([...present, ...[...selectedRarities].map(Number)]))
      .sort((a, b) => a - b)
      .map((r) => ({ value: String(r), label: String(r) }));
  }, filterDeps);

  const filteredEntries = useMemo(() => {
    return sortResourceEntries(applyFilters(entries, null), sortBy);
  }, [...filterDeps, sortBy]);

  // Same filtered list, split into one section per student — only meaningful with target data,
  // and scoped to the plans checked so it matches the aggregate `needed` above.
  const studentGroups = useMemo(() => {
    if (!showTarget || !groupByStudent) return [];
    const selectedPlans = growthPlans.filter((p) => p.isSelected);
    return buildStudentResourceGroups(selectedPlans, students, filteredEntries);
  }, [showTarget, groupByStudent, growthPlans, students, filteredEntries]);

  const eventData: EventData | null = useMemo(() => {
    if (!iconInfos) return null;
    return {
      season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
      icons: iconInfos,
    };
  }, [iconInfos]);

  interface MatrixConfig {
    rows: MatrixAxisEntry[];
    cols: MatrixAxisEntry[];
    getItemKey: (rowKey: string, colKey: string) => string | null;
  }

  const getMatrixConfig = (itemType: ItemType): MatrixConfig | null => {
    if (itemType === 'Equipment') {
      const tiers = Array.from({ length: 10 }, (_, i) => i + 1);
      return {
        rows: EQUIP_CATEGORIES.map((cat) => ({ key: cat, label: EQUIP_LABELS[cat] })),
        cols: tiers.map((tier) => ({ key: String(tier), label: `T${tier}` })),
        getItemKey: (rowKey, colKey) => {
          const ids = equipmentId[rowKey as keyof typeof equipmentId];
          const id = ids?.[Number(colKey) - 1];
          return id ? `Equipment_${id}` : null;
        },
      };
    }
    if (itemType === 'TacticalBD' || itemType === 'TechNote') {
      const base = itemType === 'TacticalBD' ? 3000 : 4000;
      return {
        rows: BD_NOTE_SCHOOL_ORDER.map((school, i) => ({ key: String(i), label: t_club(school) })),
        cols: BD_NOTE_GRADES.map((grade) => ({ key: String(grade), label: BD_NOTE_GRADE_LABEL[grade] })),
        getItemKey: (rowKey, colKey) => getBdNoteItemKey(base, Number(rowKey), Number(colKey) as BdNoteGrade),
      };
    }
    return null;
  };

  const renderMatrix = (itemType: ItemType) => {
    if (!eventData) return null;
    const config = getMatrixConfig(itemType);
    if (!config) return null;
    return (
      <ResourceMatrix
        rows={config.rows}
        cols={config.cols}
        getItemKey={config.getItemKey}
        inventory={materialInventory}
        needed={needed}
        eventData={eventData}
        iconData={iconData}
        locale={locale}
        showTarget={showTarget}
        displayMode={displayMode}
        activeKey={editingKey}
        onEditItem={setEditingKey}
      />
    );
  };

  // The list currently being browsed — Tab / prev-next buttons cycle through this, whichever view
  // is active (matrix cells in row-major order, or the flat sorted/filtered grid).
  const navigableKeys = useMemo(() => {
    if (groupByStudent) return Array.from(new Set(studentGroups.flatMap((g) => g.entries.map((e) => e.key))));
    if (showMatrix && singleMatrixType !== undefined) {
      const config = getMatrixConfig(singleMatrixType);
      if (!config) return [];
      const keys: string[] = [];
      for (const row of config.rows)
        for (const col of config.cols) {
          const k = config.getItemKey(row.key, col.key);
          if (k) keys.push(k);
        }
      return keys;
    }
    return filteredEntries.map((e) => e.key);
  }, [groupByStudent, studentGroups, showMatrix, singleMatrixType, filteredEntries, t_club]);

  const navigate = (direction: 1 | -1) => {
    if (!editingKey) return;
    const idx = navigableKeys.indexOf(editingKey);
    if (idx === -1) return;
    const nextIdx = (idx + direction + navigableKeys.length) % navigableKeys.length;
    setEditingKey(navigableKeys[nextIdx]);
  };

  // Gift affection lookup only needs the full item catalog (see giftAffectionList.ts) — our
  // `eventData` already carries that, so this reuses the exact same logic as the rest of the app.
  const giftToStudentsMap = useMemo(() => (eventData ? buildGiftToStudentsMap(students, eventData) : {}), [students, eventData]);

  // undefined when the item isn't a gift at all — distinct from an empty array (a gift nobody likes)
  const editingGiftStudents = useMemo(() => {
    if (!editingKey || !eventData) return undefined;
    const parts = splitItemKey(editingKey);
    if (!parts) return undefined;
    const [category, id] = parts;
    const info = eventData.icons.Item?.[id];
    if (category !== 'Item' || info?.ItemCategory !== 6) return undefined;
    return filterGiftStudentsForDisplay(giftToStudentsMap[id] ?? [], info.Rarity ?? 0);
  }, [editingKey, eventData, giftToStudentsMap]);

  const editingPerStudentNeeds = useMemo(() => {
    if (!editingKey || editingGiftStudents !== undefined) return [];
    return growthPlans
      .filter((p) => p.studentId != null)
      .map((p) => ({ studentId: p.studentId as number, amount: calculatedGrowthNeeds([p], students)[editingKey] ?? 0 }))
      .filter((x) => x.amount > 0)
      .map((x) => ({ ...x, name: students[x.studentId]?.Name ?? `#${x.studentId}` }))
      .sort((a, b) => b.amount - a.amount);
  }, [editingKey, editingGiftStudents, growthPlans, students]);

  // ALL students who use this material, regardless of active growth plan — only shown for Opart
  // and Eleph (deterministic 1:1 mapping). undefined = not applicable, hides the section.
  const editingAllUsers = useMemo(() => {
    if (!editingKey || editingGiftStudents !== undefined) return undefined;
    const parts = splitItemKey(editingKey);
    if (!parts || parts[0] !== 'Item') return undefined;
    const itemId = Number(parts[1]);

    if (isStudentElephKey(editingKey)) {
      return [{ studentId: itemId, name: students[itemId]?.Name ?? `#${itemId}` }];
    }

    const entryType = entries.find((e) => e.key === editingKey)?.itemType;
    if (entryType !== 'Opart') return undefined;

    return getStudentsUsingMaterial(itemId, students)
      .map((id) => ({ studentId: id, name: students[id]?.Name ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [editingKey, editingGiftStudents, entries, students]);

  return (
    <div className="p-2 sm:p-4">
      <PageHeader title={t_planner('inventory.title')} badge="BETA" description={t_planner('inventory.description')} />

      {loading || !eventData ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-10 text-center">{t_ui('loading')}</p>
      ) : (
        <>
          <InventoryFilterBar
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
            selectedTypes={selectedTypes}
            onChangeTypes={setSelectedTypes}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            showTarget={showTarget}
            onToggleShowTarget={handleToggleShowTarget}
            onlyNonZero={onlyNonZero}
            onToggleOnlyNonZero={setOnlyNonZero}
            displayMode={displayMode}
            onChangeDisplayMode={setDisplayMode}
            growthPlans={growthPlans}
            students={students}
            onTogglePlan={togglePlanSelection}
            onSelectAllPlans={selectAllPlans}
            matrixAvailable={singleMatrixType !== undefined}
            showMatrix={showMatrix && singleMatrixType !== undefined}
            onToggleMatrix={handleToggleMatrix}
            groupByStudent={groupByStudent}
            onToggleGroupByStudent={handleToggleGroupByStudent}
            schoolOptions={schoolOptions}
            selectedSchools={selectedSchools}
            onChangeSchools={setSelectedSchools}
            selectedRoles={selectedRoles}
            onChangeRoles={setSelectedRoles}
            selectedSquads={selectedSquads}
            onChangeSquads={setSelectedSquads}
            shopCategoryOptions={shopCategoryOptions}
            selectedShopCategories={selectedShopCategories}
            onChangeShopCategories={setSelectedShopCategories}
            tagOptions={tagOptions}
            selectedTags={selectedTags}
            onChangeTags={setSelectedTags}
            rarityOptions={rarityOptions}
            selectedRarities={selectedRarities}
            onChangeRarities={setSelectedRarities}
          />

          {groupByStudent ? (
            <GroupedSections
              emptyMessage={t_planner('inventory.emptyMessage')}
              sections={studentGroups.map((group) => ({
                key: String(group.studentId),
                header: (
                  <>
                    <div className="w-10 shrink-0">
                      <StudentIcon character={{ id: group.studentId } as Character} student={students[group.studentId]} portraitData={studentPortraits} />
                    </div>
                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{group.name}</span>
                  </>
                ),
                content: (
                  <ResourceGrid
                    entries={group.entries}
                    eventData={eventData}
                    iconData={iconData}
                    locale={locale}
                    showTarget={showTarget}
                    displayMode={displayMode}
                    activeKey={editingKey}
                    onEditItem={setEditingKey}
                  />
                ),
              }))}
            />
          ) : showMatrix && singleMatrixType !== undefined ? (
            renderMatrix(singleMatrixType)
          ) : (
            <ResourceGrid
              entries={filteredEntries}
              eventData={eventData}
              iconData={iconData}
              locale={locale}
              showTarget={showTarget}
              displayMode={displayMode}
              activeKey={editingKey}
              onEditItem={setEditingKey}
            />
          )}

          {editingKey &&
            (() => {
              const parts = splitItemKey(editingKey);
              if (!parts) return null;
              const [category, id] = parts;
              return (
                <QuantityEditSheet
                  itemKey={editingKey}
                  label={getItemName(editingKey, eventData.icons, locale)}
                  description={getItemDescription(editingKey, eventData.icons, locale) ?? undefined}
                  helperText={showTarget && (needed[editingKey] ?? 0) > 0 ? t_planner('affectionTab.item.need', { counts: (needed[editingKey] ?? 0).toLocaleString() }) : undefined}
                  icon={<ItemIcon type={category} itemId={id} amount={''} size={iconSize} eventData={eventData} iconData={iconData} />}
                  value={materialInventory[editingKey] ?? 0}
                  onChange={(v) => updateMaterialInventory(editingKey, v)}
                  onClose={() => setEditingKey(null)}
                  onPrev={navigableKeys.length > 1 ? () => navigate(-1) : undefined}
                  onNext={() => navigate(1)}
                  perStudentNeeds={editingPerStudentNeeds}
                  allUsers={editingAllUsers}
                  giftStudents={editingGiftStudents}
                  studentPortraits={studentPortraits}
                />
              );
            })()}
        </>
      )}
    </div>
  );
}
