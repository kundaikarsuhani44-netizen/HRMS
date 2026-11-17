import { sql } from '../db';
import { todayIST, type ISODate } from '../ist';

/** The signed-in employee, loaded from OUR database on every request. Roles never come from Clerk. */
export interface Actor {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  gender: 'Female' | 'Male' | 'Other';
  location_id: number;
  location_name: string;
  date_of_joining: ISODate;
  last_working_day: ISODate | null;
  reporting_manager_id: number | null;
  is_hr_admin: boolean;
  /** Derived: someone active has this person as reporting_manager_id. */
  is_manager: boolean;
}

export class AccessDenied extends Error {
  constructor(message = 'You do not have access to this.') {
    super(message);
    this.name = 'AccessDenied';
  }
}

export function isActiveOn(e: { date_of_joining?: ISODate; last_working_day: ISODate | null }, date: ISODate = todayIST()) {
  return !e.last_working_day || e.last_working_day >= date;
}

const actorQuery = (where: ReturnType<typeof sql>) => sql<Actor[]>`
  select e.id, e.employee_code, e.full_name, e.email, e.gender, e.location_id, l.short_name as location_name,
         e.date_of_joining, e.last_working_day, e.reporting_manager_id, e.is_hr_admin,
         exists (select 1 from employees r
                  where r.reporting_manager_id = e.id
                    and (r.last_working_day is null or r.last_working_day >= ${todayIST()}::date)) as is_manager
    from employees e join locations l on l.id = e.location_id
   where ${where}`;

export async function loadActorById(id: number): Promise<Actor | null> {
  const [a] = await actorQuery(sql`e.id = ${id}`);
  return a ?? null;
}

export async function loadActorByEmail(email: string): Promise<Actor | null> {
  const [a] = await actorQuery(sql`lower(e.email) = lower(${email})`);
  return a ?? null;
}

/** Direct reports of a manager (active only). HR admins see everyone active. */
export async function teamMemberIds(actor: Actor, opts: { hrSeesAll?: boolean } = { hrSeesAll: true }): Promise<number[]> {
  const today = todayIST();
  const rows = actor.is_hr_admin && opts.hrSeesAll
    ? await sql<{ id: number }[]>`select id from employees where (last_working_day is null or last_working_day >= ${today}::date) and id <> ${actor.id}`
    : await sql<{ id: number }[]>`select id from employees where reporting_manager_id = ${actor.id} and (last_working_day is null or last_working_day >= ${today}::date)`;
  return rows.map((r) => r.id);
}

export async function isDirectReport(managerId: number, employeeId: number): Promise<boolean> {
  const [r] = await sql`select 1 from employees where id = ${employeeId} and reporting_manager_id = ${managerId}`;
  return !!r;
}

/** Can `actor` act as approver for `employeeId`? Direct manager, or any HR admin — never yourself. */
export async function canApproveFor(actor: Actor, employeeId: number): Promise<boolean> {
  if (employeeId === actor.id) return false;
  if (actor.is_hr_admin) return true;
  return isDirectReport(actor.id, employeeId);
}

export function requireHr(actor: Actor) {
  if (!actor.is_hr_admin) throw new AccessDenied('Only HR Admin can do this.');
}
export function requireManagerOrHr(actor: Actor) {
  if (!actor.is_hr_admin && !actor.is_manager) throw new AccessDenied('Only managers and HR can do this.');
}
