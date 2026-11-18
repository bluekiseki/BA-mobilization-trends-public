import type { Server } from '../logic/releaseDates';
import type { LocalizedText } from '../logic/types';

// A promotional video: the day it went up on the official YouTube channel of each server, and where.
// `gl` is the Global server: these are the videos of the Global (English) channel. Videos of other language channels are not listed yet.
export interface PvEntry {
  id: string;
  title: LocalizedText;
  videos: Partial<Record<Server, { date: string; url?: string }>>; // without a url the date is shown as text
}

const same = (title: string): LocalizedText => ({ en: title, ko: title, ja: title, 'zh-Hant': title });

// Earliest first. A server without an entry has no video of its own for it (yet).
export const PV_LIST: PvEntry[] = [
  {
    id: '1st',
    title: same('1st PV'),
    videos: {
      jp: { date: '2020-07-17', url: 'https://www.youtube.com/watch?v=0KFPtliRn_4' },
      gl: { date: '2021-08-18', url: 'https://www.youtube.com/watch?v=YHy8JmWX3kw' },
    },
  },
  {
    id: '2nd',
    title: same('2nd PV'),
    videos: {
      jp: { date: '2021-03-19', url: 'https://www.youtube.com/watch?v=cE1ePjq5ZSs' },
      gl: { date: '2021-12-14', url: 'https://www.youtube.com/watch?v=Chh_rhWqvAA' },
    },
  },
  {
    id: '3rd',
    title: same('3rd PV'),
    videos: {
      jp: { date: '2022-02-04', url: 'https://www.youtube.com/watch?v=8TVPcRafH10' },
      gl: { date: '2022-10-28', url: 'https://www.youtube.com/watch?v=RgHiiuahpRU' },
    },
  },
  {
    id: '4th',
    title: same('4th PV'),
    videos: {
      jp: { date: '2023-01-22', url: 'https://www.youtube.com/watch?v=4rDOsvzTicY' },
      gl: { date: '2023-07-21', url: 'https://www.youtube.com/watch?v=yZa5abuIKT4' },
    },
  },
  {
    id: '4.5th',
    title: same('4.5th PV'),
    videos: {
      jp: { date: '2023-04-22', url: 'https://www.youtube.com/watch?v=N8g9B0zEXpM' },
      gl: { date: '2023-10-28', url: 'https://www.youtube.com/watch?v=d2oWj0zEToM' },
    },
  },
  {
    id: '5th',
    title: same('5th PV'),
    videos: {
      jp: { date: '2024-01-21', url: 'https://www.youtube.com/watch?v=gMZ1BWFLDMw' },
      gl: { date: '2024-07-29', url: 'https://www.youtube.com/watch?v=wZd18g3UshI' },
    },
  },
  {
    id: '6th',
    title: same('6th PV'),
    videos: {
      jp: { date: '2025-04-20', url: 'https://www.youtube.com/watch?v=JwWVgGE5b0Q' },
      gl: { date: '2025-09-23', url: 'https://www.youtube.com/watch?v=URR7yQayl1Q' },
    },
  },
  {
    id: '7th',
    title: same('7th PV'),
    videos: {
      jp: { date: '2026-04-19', url: 'https://www.youtube.com/watch?v=U6Wlb18KLrI' },
      gl: { date: '2026-08-15', url: 'https://www.youtube.com/watch?v=0V6mObLooLA' },
    },
  },
];
