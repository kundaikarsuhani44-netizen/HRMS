import { ActionForm, Field, Submit } from '@/components/ActionForm';
import { ProfileView } from '@/components/ProfileView';
import { requireActor } from '@/lib/auth';
import { INDIAN_STATES } from '@/lib/rules/validation';
import { getEmployee } from '@/lib/services/employees';
import { updateOwnContactAction } from '@/app/actions/employees';

export const metadata = { title: 'My profile' };

/** E3 + E5 — own profile. Contact fields are editable; job fields are read-only. Always the signed-in user's own id. */
export default async function MyProfile({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  const res = (await getEmployee(actor, actor.id))!;
  const { emp, sensitive } = res;
  const tab = (await searchParams).tab ?? 'personal';
  return (
    <>
      <div className="page-head"><div><h1>My profile</h1><span className="muted"><span className="mono">{emp.employee_code}</span> · {emp.designation}</span></div></div>
      <div className="card">
        <ProfileView emp={emp} s={sensitive} tab={tab === 'edit' ? 'personal' : tab} base="/profile" canReveal={false} extraTabs={[{ key: 'edit', label: '✎ Edit contact' }]} />
        {tab === 'edit' && null}
      </div>
      {(tab === 'edit' || tab === 'personal' || tab === 'emergency') && (
        <div className="card" id="edit">
          <h2>Update my contact details</h2>
          <p className="hint">You can change your phone, address and emergency contact. Job, statutory and bank details are maintained by HR — ask HR if something is wrong.</p>
          <ActionForm action={updateOwnContactAction}>
            <div className="form-grid">
              <Field name="mobile" label="Mobile" required help="10 digits, starts with 6–9"><input id="mobile" name="mobile" inputMode="numeric" defaultValue={emp.mobile} /></Field>
              <Field name="address_line" label="Address"><input id="address_line" name="address_line" defaultValue={emp.address_line ?? ''} /></Field>
              <Field name="city" label="City"><input id="city" name="city" defaultValue={emp.city ?? ''} /></Field>
              <Field name="state" label="State / UT"><select id="state" name="state" defaultValue={emp.state ?? ''}><option value="">Select…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field name="pincode" label="PIN code"><input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={emp.pincode ?? ''} /></Field>
              <div />
              <Field name="emergency_name" label="Emergency contact name"><input id="emergency_name" name="emergency_name" defaultValue={emp.emergency_name ?? ''} /></Field>
              <Field name="emergency_relation" label="Relation"><input id="emergency_relation" name="emergency_relation" defaultValue={emp.emergency_relation ?? ''} /></Field>
              <Field name="emergency_phone" label="Emergency phone"><input id="emergency_phone" name="emergency_phone" inputMode="numeric" defaultValue={emp.emergency_phone ?? ''} /></Field>
            </div>
            <Submit>Save</Submit>
          </ActionForm>
        </div>
      )}
    </>
  );
}
