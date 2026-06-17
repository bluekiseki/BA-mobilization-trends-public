export interface EventEntry {
  Name: string;
  Kr: string;
  Jp: string;
  En: string | null;
  Tw: string | null;
  OpenTime: string;
  CloseTime: string;
  Planable?: boolean;
}

export type EventListData = Record<string, EventEntry>;
