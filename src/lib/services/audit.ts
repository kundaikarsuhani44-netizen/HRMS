import { sql, type Tx } from '../db';

export interface Change { field: string; old: unknown; new: unknown }

const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

/** Diff two records over the given fields. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): Change[] {
  return fields
    .filter((f) => f in after && str(before[f]) !== str(after[f]))
    .map((f) => ({ field: f, old: before[f], new: after[f] }));
}

/** E8 — one audit row per changed field: who, what, old value, new value, when (+ optional reason). */
export async function writeAudit(
  tx: Tx,
  table: string,
  recordId: string | number,
  changes: Change[],
  changedBy: number,
  reason?: string,
) {
  for (const c of changes) {
    await tx`insert into audit_log (table_name, record_id, field, old_value, new_value, reason, changed_by)
             values (${table}, ${String(recordId)}, ${c.field}, ${str(c.old)}, ${str(c.new)}, ${reason ?? null}, ${changedBy})`;
  }
}

export interface AuditRow {
  id: number; table_name: string; record_id: string; field: string; old_value: string | null;
  new_value: string | null; reason: string | null; changed_at: Date; changed_by_name: string | null;
}

export async function auditFor(table: string | string[], recordId: string | number, limit = 50) {
  const tables = Array.isArray(table) ? table : [table];
  return sql<AuditRow[]>`
    select a.id, a.table_name, a.record_id, a.field, a.old_value, a.new_value, a.reason, a.changed_at, e.full_name as changed_by_name
      from audit_log a left join employees e on e.id = a.changed_by
     where a.table_name in ${sql(tables)} and a.record_id = ${String(recordId)}
     order by a.changed_at desc, a.id desc limit ${limit}`;
}
