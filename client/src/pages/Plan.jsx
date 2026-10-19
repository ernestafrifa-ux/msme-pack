import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, monthName, todayGhana } from '../format';
import Progress from '../Progress.jsx';

function shift(month, n) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

// A sales target and a spending budget for the month, with progress.
export default function Plan() {
  const { business } = useSession();
  const { t } = useT();
  const canManage = ['owner', 'manager'].includes(business.role);
  const [month, setMonth] = useState(todayGhana().slice(0, 7));
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ salesTarget: '', expenseLimit: '', limits: {} });
  const [cats, setCats] = useState([]);
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    api(`/businesses/${business.id}/plan?month=${month}`).then(setData).catch((err) => setMessage(err.message));
  }, [business.id, month]);
  useEffect(() => {
    api(`/businesses/${business.id}/categories`).then((d) => setCats(d.categories.filter((c) => c.kind === 'expense'))).catch(() => {});
  }, [business.id]);

  function startEdit() {
    const limits = {};
    for (const c of data.categories) if (c.limit !== null) limits[c.id] = c.limit;
    setF({ salesTarget: data.plan?.salesTarget || '', expenseLimit: data.plan?.expenseLimit || '', limits });
    setEditing(true);
  }
  async function save(e) {
    e.preventDefault();
    setMessage('');
    const categoryLimits = Object.fromEntries(Object.entries(f.limits).filter(([, v]) => v !== '' && v !== null));
    try {
      const d = await api(`/businesses/${business.id}/plan`, { method: 'PUT', body: {
        month, salesTarget: f.salesTarget === '' ? null : f.salesTarget, expenseLimit: f.expenseLimit === '' ? null : f.expenseLimit, categoryLimits } });
      setData(d); setEditing(false); setFlash('Plan saved. It carries over to the next months until you change it.');
    } catch (err) { setMessage(err.message); }
  }

  const p = data?.plan;
  const behind = p?.salesTarget && data && data.monthShare > 0 && (Number(data.sales) / Number(p.salesTarget)) * 100 < data.monthShare - 10;

  return (
    <main className="screen">
      <TopBar title="Target & budget" back="/reports" />
      <div className="month-step">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}><Icon name="back" /></button>
        <span className="month-step-label">{monthName(month, t)} {month.slice(0, 4)}</span>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setMonth(shift(month, 1))}><Icon name="chevron" /></button>
      </div>
      {flash && <div className="flash" role="status">{flash}</div>}
      <FormError message={message} />
      {data && !editing && (
        <section className="card stack">
          {!p && <p className="muted">No target or budget yet. Set one to see your progress on Home.</p>}
          {p?.carriedFrom && <p className="muted small">Same as {monthName(p.carriedFrom, t)}.</p>}
          {p?.salesTarget && <Progress label="Sales" value={data.sales} target={p.salesTarget} />}
          {behind && <p className="warn-text small">{data.monthShare}% of the month has gone. Sales are behind the target.</p>}
          {p?.expenseLimit && <Progress label="Spending" value={data.spent} target={p.expenseLimit} budget />}
          {data.categories.filter((c) => c.limit !== null).map((c) => <Progress key={c.id} label={c.name} value={c.spent} target={c.limit} budget />)}
          {data.categories.filter((c) => c.limit === null).length > 0 && (
            <div className="small muted">Other spending: {data.categories.filter((c) => c.limit === null).map((c) => `${c.name} ${money(c.spent)}`).join(' · ')}</div>
          )}
          {canManage && <button type="button" className="btn btn-primary btn-block" onClick={startEdit}>{p ? 'Change the plan' : 'Set a target and budget'}</button>}
        </section>
      )}
      {editing && (
        <form className="card stack" onSubmit={save} noValidate>
          <Field label="Sales target for the month (GHS)" hint="What you aim to receive from sales">
            {(pp) => <input {...pp} type="number" inputMode="decimal" min="0" step="0.01" value={f.salesTarget} onChange={(e) => setF({ ...f, salesTarget: e.target.value })} />}
          </Field>
          <Field label="Spending budget (GHS)" hint="Expenses and MoMo charges, not stock you buy to sell">
            {(pp) => <input {...pp} type="number" inputMode="decimal" min="0" step="0.01" value={f.expenseLimit} onChange={(e) => setF({ ...f, expenseLimit: e.target.value })} />}
          </Field>
          <fieldset className="field">
            <legend>Limits for some costs (optional)</legend>
            <div className="stack-tight">
              {cats.filter((c) => c.name !== 'Stock / raw materials').map((c) => (
                <label key={c.id} className="statement-row">
                  <span className="small">{c.name}</span>
                  <input className="limit-input" aria-label={`Limit for ${c.name}`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="—"
                    value={f.limits[c.id] ?? ''} onChange={(e) => setF({ ...f, limits: { ...f.limits, [c.id]: e.target.value } })} />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary">Save plan</button>
          </div>
        </form>
      )}
    </main>
  );
}
