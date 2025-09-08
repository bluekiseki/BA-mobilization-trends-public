// utils/raidToString.ts

import { RaidInfo } from "../types/data";


export function raidToString(raid: RaidInfo, showDate: boolean = false, showId: boolean = false): string {
    // console.log('raidToString', raid)
    if (!raid) return 'unknown'
    const { Id, Boss, Type, Date, Alias } = raid;
    const arr = []
    if (showId) arr.push(Id)
    if (Alias) arr.push(Alias)
    else {
        arr.push(Boss)
    }
    if (Type) arr.push(Type)
    let txt = arr.join('-')
    if (showDate && Date) txt += ` (${Date})`
    return txt
}
