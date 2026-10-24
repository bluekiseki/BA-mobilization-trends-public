// SchaleDB skill descriptions mark buffs/debuffs as <b:Name>, <d:Name>, <s:Name>, <c:Name>.
// Each tag resolves to a `stat:` locale key; callers decide how to render the resolved label.
const TAG_PREFIX: Record<string, string> = { b: 'Buff_', d: 'Debuff_', s: 'Special_', c: 'CC_' };

export function replaceSkillDescTags(str: string, render: (statKey: string, param: string) => string): string {
  return str.replace(/<([bdsc]):(\w+)>/g, (_, tag: string, param: string) => render(`stat:${TAG_PREFIX[tag]}${param}`, param));
}

// Per-level values as {Lv1/Lv2/...}; a value that never changes is printed once, unwrapped.
// Braces never occur in SchaleDB skill text (any language), so they cannot be confused with the
// "/" the descriptions themselves use between effects.
export function joinLevelValues(values: readonly (string | number)[] | undefined): string | undefined {
  if (!values?.length) return undefined;
  const strings = values.map(String);
  return strings.every((v) => v === strings[0]) ? strings[0] : `{${strings.join('/')}}`;
}

// Substitute <?n> placeholders with every level's value of parameter n (see joinLevelValues).
export function fillSkillParamsAllLevels(desc: string, parameters: string[][] | undefined): string {
  return desc.replace(/<\?(\d+)>/g, (match, indexStr: string) => joinLevelValues(parameters?.[Number(indexStr) - 1]) ?? match);
}
