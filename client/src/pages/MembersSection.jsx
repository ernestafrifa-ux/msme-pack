import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon } from '../components.jsx';
import { useT } from '../i18n.jsx';

const LANGUAGES = ['en', 'tw', 'ee', 'gaa', 'dag', 'ha'];

const ROLES = {
  owner: ['Owner', 'Everything, including adding people'],
  manager: ['Manager', 'Records, invoices, stock, reports and settings'],
  staff: ['Staff', 'Records sales, expenses, stock and invoices'],
  advisor: ['Advisor', 'Can look, cannot change (e.g. an accountant or business advisor)'],
};
const ADDABLE = ['manager', 'staff', 'advisor'];

function Member({ m, isOwner, me, onChanged }) {
  const { tt } = useT();
  const { business } = useSession();
  const [mode, setMode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const base = `/businesses/${business.id}/members/${m.userId}`;
  const canEdit = isOwner && m.role !== 'owner' && m.userId !== me;

  async function run(fn, ok) {
    setMessage('');
    try { const d = await fn(); onChanged(d.members, ok); setMode(''); setPassword(''); } catch (err) { setMessage(err.message); }
  }
  return (
    <li className="member">
      <div className="member-main">
        <span className="strong">{m.fullName}{m.userId === me ? ' (you)' : ''}</span>
        <span className="small muted">{m.phone.replace('+233', '0')} · {tt(ROLES[m.role][0])}
          {m.mustChangePassword ? ' · has not logged in yet' : ''}{!m.isActive ? ' · switched off' : ''}</span>
      </div>
      {canEdit && !mode && (
        <div className="asset-actions">
          <select aria-label={tt('Role for {name}', { name: m.fullName })} value={m.role}
            onChange={(e) => run(() => api(base, { method: 'PATCH', body: { role: e.target.value } }), tt('{name} is now {role}.', { name: m.fullName, role: tt(ROLES[e.target.value][0]).toLowerCase() }))}>
            {ADDABLE.map((r) => <option key={r} value={r}>{tt(ROLES[r][0])}</option>)}
          </select>
          <button type="button" className="btn-link small" onClick={() => setMode('reset')}>{tt('New password')}</button>
          <button type="button" className="btn-link small danger" onClick={() => setMode('remove')}>{tt('Remove')}</button>
        </div>
      )}
      {mode === 'reset' && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(() => api(`${base}/reset-password`, { method: 'POST', body: { password } }), tt('Give {name} the new temporary password. They will choose their own when they log in.', { name: m.fullName })); }}>
          <input aria-label={tt('Temporary password for {name}', { name: m.fullName })} placeholder={tt('Temporary password')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary">{tt('Save')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('')}>{tt('Cancel')}</button>
        </form>
      )}
      {mode === 'remove' && (
        <div className="inline-form">
          <span className="small">{tt('Remove {name} from the business?', { name: m.fullName })}</span>
          <button type="button" className="btn btn-primary" onClick={() => run(() => api(base, { method: 'DELETE' }), tt('{name} can no longer use the business.', { name: m.fullName }))}>{tt('Remove')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('')}>{tt('Cancel')}</button>
        </div>
      )}
      {message && <span className="field-error">{message}</span>}
    </li>
  );
}

// Settings: who uses this business. Only the owner adds, changes and removes people.
export default function MembersSection() {
  const { user, business, features } = useSession();
  const { t, tt } = useT();
  const [sendSms, setSendSms] = useState(true);
  const isOwner = business.role === 'owner';
  const [members, setMembers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ fullName: '', phone: '', role: 'staff', password: '', preferredLanguage: 'en' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(() => {
    api(`/businesses/${business.id}/members`).then((d) => setMembers(d.members)).catch((err) => setMessage(err.message));
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setFlash('');
    try {
      const d = await api(`/businesses/${business.id}/members`, { method: 'POST', body: { ...f, password: f.password || undefined, sendSms: !!features?.sms && sendSms } });
      setMembers(d.members);
      setFlash(d.isNew
        ? (d.sms?.sent ? tt('{name} added. The login details were sent to them by SMS.', { name: f.fullName })
          : tt('{name} added. Give them their phone number and the temporary password; they will choose their own when they first log in.{error}', { name: f.fullName, error: d.sms?.error ? ` (SMS not sent: ${d.sms.error})` : '' }))
        : tt('{name} already had an account and can now use this business with their own password.', { name: d.name }));
      setF({ fullName: '', phone: '', role: 'staff', password: '', preferredLanguage: 'en' });
      setAdding(false);
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <section className="card" aria-labelledby="people-head">
      <h2 id="people-head">{tt('People who use this business')}</h2>
      <p className="muted small">{isOwner ? tt('Add your manager, staff or an advisor. Each person logs in with their own phone number and sees only this business.') : tt('Only the owner can add or remove people.')}</p>
      {flash && <div className="flash" role="status">{flash}</div>}
      {!adding && message && <FormError message={message} />}
      <ul className="member-list">
        {members.map((m) => (
          <Member key={m.userId} m={m} isOwner={isOwner} me={user.id}
            onChanged={(list, ok) => { setMembers(list); setFlash(ok); }} />
        ))}
      </ul>
      {isOwner && !adding && (
        <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> {tt('Add a person')}</button>
      )}
      {adding && (
        <form className="stack" onSubmit={add} noValidate>
          <FormError message={message} />
          <Field label={tt('Full name')} error={errors.fullName}>
            {(p) => <input {...p} value={f.fullName} onChange={set('fullName')} />}
          </Field>
          <Field label={tt('Phone number')} error={errors.phone} hint={tt('They log in with this number')}>
            {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={f.phone} onChange={set('phone')} />}
          </Field>
          <fieldset className="field">
            <legend>{tt('What can they do?')}</legend>
            <div className="options">
              {ADDABLE.map((r) => (
                <label key={r} className={'option' + (f.role === r ? ' option-on' : '')}>
                  <input type="radio" name="role" value={r} checked={f.role === r} onChange={set('role')} />
                  <span><span className="strong">{tt(ROLES[r][0])}</span><span className="small muted block">{tt(ROLES[r][1])}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={tt('Language they prefer')}>
            {(p) => (
              <select {...p} value={f.preferredLanguage} onChange={set('preferredLanguage')}>
                {LANGUAGES.map((c) => <option key={c} value={c}>{t(`lang.${c}`)}</option>)}
              </select>
            )}
          </Field>
          <Field label={tt('Temporary password')} error={errors.password} hint={tt('At least 8 characters. Not needed if they already have an MSME Pack account.')}>
            {(p) => <input {...p} value={f.password} onChange={set('password')} autoComplete="off" />}
          </Field>
          {features?.sms && (
            <label className="check-row normal">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              <span>{tt('Send them the login details by SMS')}</span>
            </label>
          )}
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>{tt('Cancel')}</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Add person')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
