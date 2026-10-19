import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, friendlyDate, todayGhana } from '../format';
import { monthRange, PeriodPicker } from '../statements.jsx';

const KIND = { sale: 'Sale', expense: 'Expense', purchase: 'Stock bought', other_income: 'Other income', transfer: 'Transfer',
  owner_draw: 'Owner pay', owner_capital: 'Money put in', loan_repayment: 'Loan repayment', vat_payment: 'VAT paid' };

// Owner and manager: what each person recorded, what was deleted, and cash-count differences.
export default function Activity() {
  const { business } = useSession();
  const { t, tt } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/businesses/${business.id}/activity?from=${range.from}&to=${range.to}`).then(setData).catch((err) => setError(err.message));
  }, [business.id, range.from, range.to]);
  const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

  return (
    <main className="screen">
      <TopBar title={tt('Who recorded what')} back="/reports" />
      <PeriodPicker range={range} onChange={setRange} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {data && (
        <>
          <section className="card">
            <h2>{tt('People')}</h2>
            {data.people.map((p) => (
              <div key={p.userId} className="biz-row">
                <span className="strong">{p.fullName} <span className="muted small">· {tt(p.role)}</span></span>
                <span className="small">{tt('{records} records · {sales} sales worth GHS {amount} · spent GHS {spent}', { records: p.records, sales: p.salesCount, amount: money(p.sales), spent: money(p.spent) })}</span>
                <span className="small muted">
                  {p.deleted ? <span className="warn-text">{tt('{n} deleted', { n: p.deleted })} · </span> : null}
                  {p.lastAt ? tt('last recorded {date} at {lastAt}', { date: friendlyDate(p.lastAt.slice(0, 10), t), lastAt: time(p.lastAt) }) : tt('nothing recorded')}
                </span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>{tt('Deleted records')}</h2>
            {!data.deletions.length && <p className="muted small">{tt('Nothing was deleted in this period.')}</p>}
            {data.deletions.map((d, i) => (
              <div key={i} className="biz-row">
                <span className="strong">{tt(KIND[d.kind] || d.kind)} · GHS {money(d.amount)}</span>
                <span className="small muted">{d.items || d.note || ''}</span>
                <span className="small">{tt('Recorded by {by} for {date} · deleted by {deletedBy} on {on} at {time}', { by: d.recordedBy, date: friendlyDate(d.date, t), deletedBy: d.deletedBy, on: friendlyDate(d.at.slice(0, 10), t), time: time(d.at) })}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>{tt('Cash count differences')}</h2>
            {!data.differences.length && <p className="muted small">{tt('Every count matched the records.')}</p>}
            {data.differences.map((d, i) => (
              <div key={i} className="statement-row">
                <span className="small">{friendlyDate(d.date, t)} · {d.account} · {d.countedBy}</span>
                <span className={'num ' + (Number(d.difference) < 0 ? 'warn-text' : '')}>{Number(d.difference) > 0 ? '+' : ''}{money(d.difference)}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
