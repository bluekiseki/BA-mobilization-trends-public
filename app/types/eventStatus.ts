export type EventStatus = 'active' | 'upcoming';

export interface StatusEvent {
  id: number;
  name: string;
  status: EventStatus;
  dateIso: string; // end date if active, start date if upcoming
  planable?: boolean;
}
