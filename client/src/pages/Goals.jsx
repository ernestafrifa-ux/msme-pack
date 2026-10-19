import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, longDate } from '../format';

// Saving up for something (a photocopier, rent, a freezer) in one of the places money is kept.
export default function Goals() {
  const { business } = useSession();
  const { t } = useT();
  const navigate = useNavigate();
  const canManage = ['owner', 'manager'].includes(business.role);
  const [goals, setGoals] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', target: '', targetDate: '', accountId: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    api(`/businesses/${business.id}/goals`).then((d) => setGoals(d.goals)).catch((err) => setMessage(err.message));
    api(`/businesses/${business.id}/accounts`).then((d) => setAccounts(d.accounts)).catch(() => {});
  }, [business.id]);

  async function add(e) {
    e.preventDefault();
    setErrors({}); setMessage('');
    try {
      const d = await api(`/businesses/${business.id}/goals`, { method: 'POST', body: { ...f, targetDate: f.targetDate || null } });
      setGoals(d.goals); setAdding(false); setF({ name: '', target: '', targetDate: '', accountId: '' });
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); }
  }
  async function remove(g) {
    if (!window.confirm(`Remove the goal "${g.name}"? The money stays in ${g.accountName}.`)) return;
    const d = await api(`/businesses/${business.id}/goals/${g.id}`, { method: 'DELETE' });
    setGoals(d.goals);
  }

  return (
    <main className="screen">
      <TopBar title="Savings goals" back="/reports" />
      <p className="lead">Save for something in a separate place: a savings box, a susu or a bank account. Each transfer into it moves you closer.</p>
      <FormError message={!adding ? message : ''} />
      {goals && goals.map((g) => (
        <section key={g.id} className="card stack-tight goal">
          <div className="statement-row"><span className="strong">{g.name}</span>{g.reached && <span className="tag">reached</span>}</div>
          <div className="bar" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pct}>
            <div style={{ width: `${g.pct}%` }} />
          </div>
          <div className="small">GHS {money(g.saved)} of {money(g.target)} saved in {g.accountName} ({g.pct}%)</div>
          {!g.reached && (
            <div className="small muted">
              GHS {money(g.left)} to go{g.targetDate ? ` by ${longDate(g.targetDate, t)}` : ''}{g.perMonth ? `: about GHS ${money(g.perMonth)} a month` : ''}
            </div>
          )}
          <div className="asset-actions">
            {!g.reached && <button type="button" className="btn-link small" onClick={() => navigate('/record/transfer', { state: { toAccountId: g.accountId } })}>Put money aside</button>}
            {canManage && <button type="button" className="btn-link small danger" onClick={() => remove(g)}>Remove goal</button>}
          </div>
        </section>
      ))}
      {goals && !goals.length && !adding && <p className="muted">No goals yet.</p>}
      {canManage && !adding && (
        <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => { setAdding(true); setF((x) => ({ ...x, accountId: accounts.find((a) => /sav|susu/i.test(a.name))?.id || '' })); }}>
          <Icon name="plus" size={18} /> Add a goal
        </button>
      )}
      {adding && (
        <form className="card stack" onSubmit={add} noValidate>
          <FormError message={message} />
          <Field label="What are you saving for?" error={errors.name}>
            {(p) => <input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. New photocopier" />}
          </Field>
          <div className="grid-2">
            <Field label="Amount needed (GHS)" error={errors.target}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />}
            </Field>
            <Field label="By when (optional)" error={errors.targetDate}>
              {(p) => <input {...p} type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />}
            </Field>
          </div>
          <Field label="Saved in" error={errors.accountId} hint="Best kept apart from the daily cash box">
            {(p) => (
              <select {...p} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                <option value="">Choose…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </Field>
          <p className="muted small">No savings place yet? Add one (a &ldquo;Savings box&rdquo;, a susu or a bank account) in <Link to="/settings">Settings → Where you keep money</Link>.</p>
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary">Save goal</button>
          </div>
        </form>
      )}
    </main>
  );
}
