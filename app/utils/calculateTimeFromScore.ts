import { getDifficultyFromScoreAndBoss, type DifficultyName } from "~/components/Difficulty";
import type { GameServer } from "~/types/data";

const mat_4m = {
    'Lunatic': { a: 54393000, b: 2880 },
    'Torment': { a: 40348000, b: 2400 },
    'Insane': { a: 27928000, b: 1920 },
    'Extreme': { a: 15344000, b: 1440 },
    'Hardcore': { a: 7672000, b: 960 },
    'Veryhard': { a: 3836000, b: 480 },
    'Hard': { a: 1918000, b: 240 },
    'Normal': { a: 959000, b: 120 },
}
const mat_3m = {
    'Lunatic': { a: 54393000, b: 2880 },
    'Torment': { a: 39716000, b: 2400 },
    'Insane': { a: 26161600, b: 1920 },
    'Extreme': { a: 14576000, b: 1440 },
    'Hardcore': { a: 7288000, b: 960 },
    'Veryhard': { a: 3644000, b: 480 },
    'Hard': { a: 1822000, b: 240 },
    'Normal': { a: 911000, b: 120 },
};

const mat_4m30s = {
    'Lunatic': { a: 55032000, b: 2880 }, // 54393000 tmep.
    'Torment': { a: 41142000, b: 2400 }, // 40348000 tmep.
    'Insane': { a: 28653000, b: 1920 }, // 27928000 tmep.
    'Extreme': { a: 15760000, b: 1440 }, // 15344000
    'Hardcore': { a: 7893600, b: 960 }, // 7672000
    'Veryhard': { a: 3946800, b: 480 },
    'Hard': { a: 1973400, b: 240 }, // 1973399.9999984
    'Normal': { a: 986700, b: 120 }, //959000
}

const mat_4m_old = {
    'Torment': { a: 40348000, b: 12800 },
    'Insane': { a: 27928000, b: 12800 },
    'Extreme': { a: 15344000, b: 6400 },
    'Hardcore': { a: 7672000, b: 3200 },
    'Veryhard': { a: 3836000, b: 1600 },
    'Hard': { a: 1918000, b: 800 },
    'Normal': { a: 959000, b: 800 },
}
const mat_3m_old = {
    'Insane': { a: 26161600, b: 12800 },
    'Extreme': { a: 14576000, b: 6400 },
    'Hardcore': { a: 7288000, b: 3200 },
    'Veryhard': { a: 3644000, b: 1600 },
    'Hard': { a: 1822000, b: 800 },
    'Normal': { a: 911000, b: 800 },
}

const bosses_limit_3m = [
    'Binah', '비나', 'ビナー', '薇娜',
    'KAITEN', '카이텐', 'カイテン', '凱坦澤'
];
const bosses_limit_4_30m = [
    'Yesod', '예소드', 'イェソド',
];

export function getTimeoutFromBoss(boss: string): 3 | 4 | 4.5 {
    if (bosses_limit_3m.includes(boss)) return 3
    if (bosses_limit_4_30m.includes(boss)) return 4.5

    return 4
}

export function isNeedOldVersion(server: GameServer, id: string): boolean {
    const isRaid = id.startsWith('R')

    if (server == 'jp') {
        if (isRaid) {
            if (Number(id.substring(1)) <= 47) return true
        }
    } else {
        if (isRaid) {
            if (Number(id.substring(1)) <= 43) return true
        }
    }
    return false
}

export function calculateTimeFromScore(score: number, boss: string, server: GameServer, id: string) {
    // difficulty: DifficultyName,

    const timeout = getTimeoutFromBoss(boss)
    const difficulty = getDifficultyFromScoreAndBoss(score, server, id)

    // console.log('calculateTimeFromScore', score, boss, server, timeout, difficulty)
    const needOldVersion = isNeedOldVersion(server, id)
    if (needOldVersion) {
    }
    const mat = needOldVersion ? (timeout == 4 ? mat_4m_old : mat_3m_old) : (timeout == 4 ? mat_4m : (timeout == 3 ? mat_3m : mat_4m30s))


    if (!(difficulty in mat)) {
        // console.error('difficulty', difficulty, mat)
        return
    }

    const { a, b } = mat[difficulty as keyof typeof mat]
    const t = (a - score) / b
    return t

}


export function calculateScoreFromTime(
    time: number,
    difficulty: DifficultyName,
    boss: string,
    server: GameServer,
    id: string
) {
    const timeout = getTimeoutFromBoss(boss);
    const needOldVersion = isNeedOldVersion(server, id);

    if (needOldVersion) {

    }

    const mat = needOldVersion
        ? (timeout == 4 ? mat_4m_old : mat_3m_old)
        : (timeout == 4 ? mat_4m : (timeout == 3 ? mat_3m : mat_4m30s));

    if (!(difficulty in mat)) {
        return;
    }

    // Get coefficients a and b from mat.
    const { a, b } = mat[difficulty as keyof typeof mat];
    const score = a - (time * b);
    return score | 0;
}