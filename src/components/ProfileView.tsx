import Link from 'next/link';
import { fmtDate, fmtDateTime } from '@/lib/ist';
import type { AuditRow } from '@/lib/services/audit';
import type { EmployeeRow, MaskedSensitive } from '@/lib/services/employees';
import { Reveal } from './Reveal';

export const PROFILE_TABS = [
  { key: 'personal', label: 'Personal' }, { key: 'job', label: 'Job' }, { key: 'statutory', label: 'Statutory' },
  { key: 'bank', label: 'Bank' }, { key: 'emergency', label: 'Emergency contact' },
];

/** E3 — profile tabs. Sensitive values arrive here already masked by the server (E7). */
export function ProfileView({ emp, s, tab, base, canReveal, audit, extraTabs = [] }: {
  emp: EmployeeRow; s: MaskedSensitive; tab: string; base: string; canReveal: boolean; audit?: AuditRow[];
  extraTabs?: { key: string; label: string }[];
}) {
  const tabs = [...PROFILE_TABS, ...(audit ? [{ key: 'audit', label: 'Audit trail' }] : []), ...extraTabs];
  const v = (x: string | null | undefined) => x || <span className="hint">—</span>;
  return (
    <>
      <nav className="tabs" aria-label="Profile sections">
        {tabs.map((t) => <Link key={t.key} href={`${base}?tab=${t.key}`} className={tab === t.key ? 'active' : ''}>{t.label}</Link>)}
      </nav>
      {tab === 'personal' && (
        <dl className="kv">
          <dt>Full name</dt><dd>{emp.full_name}</dd>
          <dt>Employee code</dt><dd className="mono">{emp.employee_code}</dd>
          <dt>Email</dt><dd>{emp.email}</dd>
          <dt>Mobile</dt><dd>{emp.mobile}</dd>
          <dt>Date of birth</dt><dd>{fmtDate(emp.dob)}</dd>
          <dt>Gender</dt><dd>{emp.gender}</dd>
          <dt>Address</dt><dd>{[emp.address_line, emp.city, emp.state, emp.pincode].filter(Boolean).join(', ') || <span className="hint">—</span>}</dd>
        </dl>
      )}
      {tab === 'job' && (
        <dl className="kv">
          <dt>Designation</dt><dd>{emp.designation}</dd>
          <dt>Department</dt><dd>{emp.department_name}</dd>
          <dt>Location</dt><dd>{emp.location_name}</dd>
          <dt>Reporting manager</dt><dd>{emp.manager_name ? `${emp.manager_name} (${emp.manager_code})` : <span className="hint">— top of hierarchy</span>}</dd>
          <dt>Date of joining</dt><dd>{fmtDate(emp.date_of_joining)}</dd>
          <dt>Last working day</dt><dd>{emp.last_working_day ? fmtDate(emp.last_working_day) : <span className="hint">—</span>}</dd>
          <dt>Salary grade</dt><dd>{v(emp.salary_grade)}</dd>
          <dt>Status</dt><dd>{emp.is_active ? <span className="badge present">Active</span> : <span className="badge absent">Exited</span>} {emp.is_hr_admin && <span className="badge hr">HR Admin</span>}</dd>
        </dl>
      )}
      {tab === 'statutory' && (
        <dl className="kv">
          <dt>PAN</dt><dd>{canReveal && s.has_statutory ? <Reveal employeeId={emp.id} field="pan" masked={s.pan} /> : <span className="mono">{s.pan}</span>}</dd>
          <dt>Aadhaar</dt><dd><span className="mono">{s.aadhaar}</span> <span className="hint">· never displayed in full</span></dd>
          <dt>UAN (PF)</dt><dd className="mono">{v(s.uan)}</dd>
        </dl>
      )}
      {tab === 'bank' && (
        <dl className="kv">
          <dt>Account number</dt><dd>{canReveal && s.has_bank ? <Reveal employeeId={emp.id} field="account_number" masked={s.account} /> : <span className="mono">{s.account}</span>}</dd>
          <dt>IFSC</dt><dd className="mono">{v(s.ifsc)}</dd>
          <dt>Bank</dt><dd>{v(s.bank_name)}</dd>
        </dl>
      )}
      {tab === 'emergency' && (
        <dl className="kv">
          <dt>Name</dt><dd>{v(emp.emergency_name)}</dd>
          <dt>Relation</dt><dd>{v(emp.emergency_relation)}</dd>
          <dt>Phone</dt><dd>{v(emp.emergency_phone)}</dd>
        </dl>
      )}
      {tab === 'audit' && audit && (
        audit.length === 0 ? <div className="empty">No changes recorded yet.</div> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>When (IST)</th><th>Who</th><th>Record</th><th>Field</th><th>Old value</th><th>New value</th><th>Reason</th></tr></thead>
            <tbody>{audit.map((a) => (
              <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.changed_at)}</td><td>{a.changed_by_name ?? '—'}</td><td>{a.table_name.replace('employee_', '')}</td>
                <td><code>{a.field}</code></td><td className="mono">{a.old_value ?? '—'}</td><td className="mono">{a.new_value ?? '—'}</td><td>{a.reason ?? ''}</td></tr>
            ))}</tbody>
          </table></div>
        )
      )}
    </>
  );
}
