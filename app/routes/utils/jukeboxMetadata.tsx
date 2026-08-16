export const eventConvertor = {
  0: 801, // Cherry Blossom Bonanza!
  1: 802, // Ivan Kupala of the Revolution
  2: 803, // Summer Sky's Wishlist
  3: 804, // Prefect Team Leader Hina's Summer Vacation!
  4: 805, // Tag in Neverland
  5: 806, // Bunny Chasers on Board
  6: 808, // No. 227 Hot Spring Resort Operations Log!
  7: 809, // New Year's Rhapsody No. 68
  8: 810, // Schale's Happy♡Valentine Patrol
  9: 811, // Kosaka Wakamo's Silence and Feast
  10: 812, // The Clumsy Sister and the Magician of the Old Library
  11: 813, // An Unbending Heart
  12: 814, // Abydos Resort Restoration Task Force
  13: 815, // Business Trip! Hyakkiyako Seaside House Franchise Plan
  14: 816, // After-School Sweets Story ~Sweet Secrets and Gunfights~
  15: 817, // ON YOUR MARK ＠ MILLENNIUM
  16: 818, // Get Set, Go! ~Kivotos Halo Games~
  17: 819, // Merry Christmas in the Cathedral ~Gift of the Relief Knights~
  18: 820, // New Year's Aperitif ~New Year's Showdown~
  19: 822, // Atra-Hasis's Ark Occupation
  20: 824, // Restoration Work: D.U. Shiratori District
  22: 824,
  23: 825, // The Pure White Calling Card ~The False Mansion and Where Aesthetics Lie~
  24: 826, // Ryomudongju ~What We Draw in Our Hearts is a Single Future~
  25: 827, // Summer Special Ops! The Rabbit's Chase for the Missing Shrimp
  26: 828, // In Search of the Hidden Heritage ~Trinity's Extracurricular Activities~
  27: 829, // Academy Doujin Story ~The Finale the Two Reached~
  28: 830, // Trip-Trap-Train
  29: 831, // A Certain Scientific Youth Record
  30: 832, // Cyber New Year March
  31: 833, // Their Nocturne Towards the Light
  32: 834, // From Opera 0068 With Love!
  33: 835, // Bustling and Harmoniously
  34: 836, // -ive aLIVE!
  35: 837, // Say-Bing!
  36: 838, // Sheside outside
  37: 839, // Wolhwamongso
  38: 840, // Gentle on the Outside, Strong on the Inside
  39: 841, // Serenade Promenade
  40: 842, // The Secret Midnight Party ~Tag as the Bell Tolls~
  41: 843, // Code: BOX The Shadow Creeping Up on Millennium~ One Question and Two Answers ~
  42: 844, // Pandemic Hazard ~ The Miraculous Pancake ~
  43: 845, // Pray-Ball! ~ Aim for the Grand Slam! ~
  44: 846, // The Highlander Railway Runaway Incident ~And Then There Were No Trains~
  45: 847, // A Single Flower Bloomed from the Sand ~A Fair and Square, Aquatic Showdown~
  46: 848, // Summer Sky's Promise
  47: 849, // We Are the Occult Research Club! ~School Mysteries and Ancient Spells~
  48: 850, // For Whom is This Art? ~The Whereabouts of Forgery and Aesthetics~
  49: 851, // Magical Girl
  50: 852,
  51: 853,
  52: 854,
  53: 856,
  54: 859,
  55: 860,
};

// --- ICON COMPONENTS ---
export const AutoplayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
  </svg>
);
export const RepeatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
      clipRule="evenodd"
    />
  </svg>
);
export const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
  </svg>
);

export const GENERAL_CATEGORIES = {
  Work: 'category.work',
  Raid: 'category.raid',
  GroupStory: 'category.group_story',
  MiniStory: 'category.mini_story',
  WorkStory: 'category.work_story',
  Other: 'category.other',
};

export const XREF_PREFIXES: Record<string, string> = {
  Main_Story: 'prefix.main_story',
  Event_Story: 'prefix.event_story',
  Favor_Story: 'prefix.favor_story',
  Memorial: 'prefix.memorial',
  Work: 'prefix.work',
  UI: 'prefix.ui',
  raid: 'prefix.raid',
  limitraid: 'prefix.limitraid',
  Group_Story: 'prefix.group_story',
  Mini_Story: 'prefix.mini_story',
  Work_Story: 'prefix.work_story',
};

// https://bluearchive.wikiru.jp/?%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AA%E3%83%BC
export const mainStoryChapters: Record<string, { key: string; date: string }> = {
  '1부 Vol.1 1장': { key: 'vol1_ch1', date: '2021/02/04' },
  '1부 Vol.1 2장': { key: 'vol1_ch2', date: '2021/03/11' },
  '1부 Vol.1 3장': { key: 'vol1_ch3', date: '2024/2/7' },
  '1부 Vol.2 1장': { key: 'vol2_ch1', date: '2021/03/25' },
  '1부 Vol.2 2장': { key: 'vol2_ch2', date: '2022/11/23' },
  '1부 Vol.3 1장': { key: 'vol3_ch1', date: '2021/05/27' },
  '1부 Vol.3 2장': { key: 'vol3_ch2', date: '2021/10/27' },
  '1부 Vol.3 3장': { key: 'vol3_ch3', date: '2021/12/15' },
  '1부 Vol.3 4장': { key: 'vol3_ch4', date: '2022/5/24' },
  '1부 Vol.4 1장': { key: 'vol4_ch1', date: '2022/03/23' },
  '1부 Vol.4 2장': { key: 'vol4_ch2', date: '2023/06/07' },
  '1부 Vol.5 1장': { key: 'vol5_ch1', date: '2023/11/08' },
  '1부 Vol.5 2장': { key: 'vol5_ch2', date: '2025/05/21' },
  '1부 Vol.6 1장': { key: 'vol6_ch1', date: '2025/09/17' },
  '1부 Vol.6 2장': { key: 'vol6_ch2', date: '2025/10/08' },
  '1부 Vol.6 3장': { key: 'vol6_ch3', date: '2025/11/12' },
  '1부 Ex. 데카그라마톤 편 1장': { key: 'ex_deca_ch0', date: '2021/11/09' },
  '1부 Ex. 데카그라마톤 편 2장': { key: 'ex_deca_ch1', date: '2024/11/6' },
  '1부 Ex. 데카그라마톤 편 3장': { key: 'ex_deca_ch2', date: '2026/01/18' },
  '1부 Final. 그리고 모든 기적이 시작되는 곳 편 1장': {
    key: 'final_ch1',
    date: '2023/01/22',
  },
  '1부 Final. 그리고 모든 기적이 시작되는 곳 편 2장': {
    key: 'final_ch2',
    date: '2023/01/24',
  },
  '1부 Final. 그리고 모든 기적이 시작되는 곳 편 3장': {
    key: 'final_ch3',
    date: '2023/02/22',
  },
  '1부 Final. 그리고 모든 기적이 시작되는 곳 편 4장': {
    key: 'final_ch4',
    date: '2023/03/08',
  },
  '2부 프롤로그': { key: 'part2_prologue', date: '2026/04/22' },
  '2부 Vol.0 1장': { key: 'part2_vol0_ch1', date: '2026/04/22' },
  '2부 Ex. 로어추적 편 1장': { key: 'part2_ex_lore_ch1', date: '2026/04/22' },
  '2부 Ex. 로어추적 편 2장': { key: 'part2_ex_lore_ch2', date: '2026/05/27' },
  '2부 Vol.1 1장': { key: 'part2_vol1_ch1', date: '2026/08/12' },
  '2부 Vol.1 2장': { key: 'part2_vol1_ch2', date: '2026/08/19' },
};

export const otherStoryTitles = {
  Group_Story: {
    '11': 'GourmetClub',
    '12': 'CleanNClearing',
    '13': 'RedwinterSecretary',
    '14': 'Engineer',
    '15': 'Veritas',
    '16': 'FoodService',
    '17': 'KnightsHospitaller',
    '18': 'Justice',
    '19': 'Fuuki',
    '20': 'HoukagoDessert',
    '21': 'Countermeasure',
    '22': 'Kohshinjo68',
    '23': 'MatsuriOffice',
    '24': 'Shugyobu',
    '25': 'GameDev',
    '26': 'BlackTortoisePromenade',
    '27': 'Valkyrie',
    '28': 'Class227',
    '29': 'NinpoKenkyubu',
    '30': 'RabbitPlatoon',
    '31': 'TheSeminar',
    '32': 'Onmyobu',
    '33': 'TrainingClub',
    '34': 'Genryumon',
    '35': 'HotSpringsDepartment',
    '36': 'TeaParty',

    // ... other group story titles
  },
  Mini_Story: {
    '-1': {
      ko: '미니 스토리 예시',
      jp: 'ミニストーリーの例',
      en: 'Mini Story Example',
    },
    // ... other mini story titles
  },
};

export type OtherStoryData = typeof otherStoryTitles;

export const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
    />
  </svg>
);

export const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
  </svg>
);

export const SoundWaveIcon = () => (
  <div className="flex items-center justify-center w-8 h-8 space-x-1">
    <span className="w-1 h-3 bg-current animate-[wave_1s_ease-in-out_infinite] delay-[-0.4s]"></span>
    <span className="w-1 h-5 bg-current animate-[wave_1s_ease-in-out_infinite] delay-[-0.2s]"></span>
    <span className="w-1 h-2 bg-current animate-[wave_1s_ease-in-out_infinite]"></span>
  </div>
);

export const VolumeIcon = ({ volume }: { volume: number }) => {
  if (volume === 0)
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
    );
  if (volume < 50)
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
      </svg>
    );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
};
