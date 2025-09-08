'use client'

import { RaidInfo } from "../types/data"

export type DifficultyName = "Lunatic" | "Torment" | "Insane" | "Extrime"
export type DifficultySelect = "All" | DifficultyName
export const difficultyInfo: {name:DifficultyName, cut:number}[] = [
    {
        name: "Lunatic",
        cut: 45000000
    },
    {
        name: "Torment",
        cut: 28000000
    },
    {
        name: "Insane",
        cut: 25000000
    },
    {
        name: "Extrime",
        cut: 0
    },
]

function getDiffculty(rank:number, raidInfo: RaidInfo){
    let s = 0
    for (const {name} of difficultyInfo){
        if (name == 'Extrime') continue
        s += raidInfo.Cnt[name]
        if (rank <= s) return name
    }
    throw ""
}