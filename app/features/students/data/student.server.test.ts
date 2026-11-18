import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStudentDetail } from './student.server';
import { publicStudentSchema, skillDescription } from './publicStudent';

const student = {
  Id: 10000,
  Name: 'Aru',
  School: 'Gehenna',
  Club: 'Handyman68',
  SquadType: 'Main',
  TacticRole: 'DamageDealer',
  BulletType: 'Explosion',
  ArmorType: 'LightArmor',
  StarGrade: 3,
  StreetBattleAdaptation: 4,
  OutdoorBattleAdaptation: 1,
  IndoorBattleAdaptation: 3,
  Skills: {},
  FavorAlts: [10031],
  MemoryLobby: [6, 6, 6],
  SecretUnusedField: 'not public',
};
afterEach(() => vi.unstubAllGlobals());

describe('public student detail', () => {
  it('rejects malformed IDs before fetching data', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(loadStudentDetail(new Request('http://invalid.test/students/01'), 'en', '01')).rejects.toMatchObject({ status: 404 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns 404 for an unknown student in a successfully loaded catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ 10000: student })));
    await expect(loadStudentDetail(new Request('http://missing.test/students/999'), 'en', '999')).rejects.toMatchObject({ status: 404 });
  });
  it('distinguishes source failure from a missing student', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(loadStudentDetail(new Request('http://source-failure.test/students/10000'), 'en', '10000')).rejects.toMatchObject({ status: 503 });
  });
  it('keeps profiles available when optional enrichment fails and excludes unused fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(url.includes('students.min.json') ? Response.json({ 10000: student }) : new Response('', { status: 503 }))),
    );
    const result = await loadStudentDetail(new Request('http://optional.test/students/10000'), 'en', '10000');
    expect(result.student.Name).toBe('Aru');
    expect(result.student).not.toHaveProperty('MemoryLobby');
    expect(result.student).not.toHaveProperty('SecretUnusedField');
    expect(result.related).toEqual([]);
  });
  it('attaches only the summons that have skill text, in the order of the student skills', async () => {
    const summons = [
      { Id: 40004, Name: 'Turret', Skills: [{ Type: 'Normal', Effects: [] }] },
      { Id: 40015, Name: 'Thermite', Skills: [{ Type: 'Normal' }, { Name: 'Punch', Desc: 'Hits for <?1>', Parameters: [['10%', '20%']], Type: 'Public' }] },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('students.min.json'))
          return Promise.resolve(
            Response.json({
              10000: {
                ...student,
                Summons: [
                  { Id: 40004, SourceSkill: 'Ex' },
                  { Id: 40015, SourceSkill: 'Ex' },
                ],
              },
            }),
          );
        return Promise.resolve(url.includes('summons.min.json') ? Response.json(summons) : new Response('', { status: 503 }));
      }),
    );
    const result = await loadStudentDetail(new Request('http://summons.test/students/10000'), 'en', '10000');
    expect(result.summons).toEqual([{ Id: 40015, Name: 'Thermite', skills: [{ Name: 'Punch', Desc: 'Hits for <?1>', Parameters: [['10%', '20%']], follows: 'Public' }] }]);
  });
  it('does not accept an invalid source as an empty catalog', () => {
    expect(publicStudentSchema.safeParse({ ...student, Id: '10000' }).success).toBe(false);
  });
  it('renders level parameters and translated effects as plain text', () => {
    expect(skillDescription({ Name: 'Skill', Desc: '<b:ATK> <?1>\\ntext', Parameters: [['10%', '20%']] }, 2, () => 'Attack')).toBe('Attack 20%\ntext');
  });
});
