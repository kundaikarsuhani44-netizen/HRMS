import { sql } from '../db';
import type { ISODate } from '../ist';
import type { HolidayType, LocationCalendar } from '../rules/calendar';

export interface Holiday { id: number; location_id: number; location_name: string; date: ISODate; name: string; type: HolidayType }

export async function getLocationCalendars(from: ISODate, to: ISODate): Promise<Map<number, LocationCalendar>> {
  const locs = await sql<{ id: number; weekly_off_days: number[] }[]>`select id, weekly_off_days from locations`;
  const hols = await sql<Holiday[]>`select location_id, date, name, type from holidays where date between ${from} and ${to}`;
  const map = new Map<number, LocationCalendar>();
  for (const l of locs) map.set(l.id, { weeklyOffDays: l.weekly_off_days.map(Number), holidays: new Map() });
  for (const h of hols) map.get(h.location_id)?.holidays.set(h.date, { name: h.name, type: h.type });
  return map;
}

export async function getLocationCalendar(locationId: number, from: ISODate, to: ISODate): Promise<LocationCalendar> {
  const cal = (await getLocationCalendars(from, to)).get(locationId);
  if (!cal) throw new Error(`Unknown location ${locationId}`);
  return cal;
}

export async function listHolidays(opts: { locationId?: number; year: number; month?: number }): Promise<Holiday[]> {
  const from = opts.month ? `${opts.year}-${String(opts.month).padStart(2, '0')}-01` : `${opts.year}-01-01`;
  const to = opts.month
    ? new Date(Date.UTC(opts.year, opts.month, 0)).toISOString().slice(0, 10)
    : `${opts.year}-12-31`;
  return sql<Holiday[]>`
    select h.id, h.location_id, l.short_name as location_name, h.date, h.name, h.type
      from holidays h join locations l on l.id = h.location_id
     where h.date between ${from} and ${to}
       ${opts.locationId ? sql`and h.location_id = ${opts.locationId}` : sql``}
     order by h.date, l.short_name`;
}
