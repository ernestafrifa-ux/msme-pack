import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, Icon } from '../components.jsx';
import { money } from '../format';

// Settings: the places the business keeps money, and adding a bank account (or another MoMo or cash box).
export default function AccountsSection() {
  const { business } = useSession();
  const { t } = useT();
  const canManage = ['owner', 'manager'].includes(business.role);
  const [accounts, setAccounts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: 'bank', name: '', lastDigits: '', openingBalance: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/businesses/${business.id}/accounts`).then((a) => setAccounts(a.accounts)).catch((err) => setMessage(err.message));
  }, [business.id]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setSaved('');
    const name = f.kind === 'bank' && f.name && !/\b(bank|account)\b/i.test(f.name) ? `${f.name} account` : f.name;
    try {
      await api(`/businesses/${business.id}/accounts`, {
        method: 'POST',
        body: { kind: f.kind, name, provider: f.kind === 'cash' ? null : f.name, lastDigits: f.lastDigits || null, openingBalance: f.openingBalance || 0 },
      });
      setSaved(t('settings.accSaved', { name }));
      setF({ kind: 'bank', name: '', lastDigits: '', openingBalance: '' });
      setAdding(false);
      load();
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <section className="card">
      <h2>{t('settings.accounts')}</h2>
      <p className="muted small">{t('settings.accountsLead')}</p>
      {saved && <div className="flash" role="status">{saved}</div>}
      <ul className="acct-list">
        {accounts.map((a) => (
          <li key={a.id}>
            <span><span className="strong">{a.name}</span> <span className="muted small">{t(`settings.kind.${a.kind}`)}</span></span>
            <span className="num">{money(a.balance)}</span>
          </li>
        ))}
      </ul>
      {canManage && !adding && (
        <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> {t('settings.addAccount')}
        </button>
      )}
      {adding && (
        <form className="stack" onSubmit={save} noValidate>
          <FormError message={message} />
          <Field label={t('settings.kind')} error={errors.kind}>
            {(p) => (
              <select {...p} value={f.kind} onChange={set('kind')}>
                <option value="bank">{t('settings.kind.bank')}</option>
                <option value="mobile_money">{t('settings.kind.mobile_money')}</option>
                <option value="cash">{t('settings.kind.cash')}</option>
              </select>
            )}
          </Field>
          <Field label={f.kind === 'bank' ? t('setup.bankName') : t('settings.accName')} error={errors.name}
            hint={f.kind === 'bank' ? t('settings.bankHint') : f.kind === 'mobile_money' ? t('settings.momoHint') : t('settings.cashHint')}>
            {(p) => <input {...p} value={f.name} onChange={set('name')} placeholder={f.kind === 'bank' ? t('setup.bankNamePh') : ''} />}
          </Field>
          <div className="grid-2">
            <Field label={t('setup.bankBalance')} error={errors.openingBalance}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={f.openingBalance} onChange={set('openingBalance')} />}
            </Field>
            {f.kind === 'bank' && (
              <Field label={t('settings.lastDigits')} error={errors.lastDigits}>
                {(p) => <input {...p} inputMode="numeric" maxLength={4} value={f.lastDigits} onChange={set('lastDigits')} />}
              </Field>
            )}
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('common.saving') : t('settings.accSave')}</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
        </form>
      )}
    </section>
  );
}
