import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { money, friendlyDate, KIND_LABEL, direction } from '../format';

const FILTERS = [
  ['', 'All'],
  ['sale', 'Sales'],
  ['expense', 'Expenses'],
  ['purchase', 'Stock'],
  ['transfer', 'Transfers'],
];

export function TxnRow({ t, showDate, onDelete }) {
  const dir = direction(t.kind);
  const sign = dir > 0 ? '+' : dir < 0 ? '−' : '';
  const where = t.kind === 'transfer' ? `${t.accountName} → ${t.toAccountName}` : t.accountName;
  const title = t.invoiceNumber
    ? `${t.invoiceNumber} payment${t.contactName ? ` · ${t.contactName}` : ''}`
    : t.itemsSummary || t.categoryName || t.note || KIND_LABEL[t.kind];
  return (
    <li className="txn">
      <div className={'txn-dot ' + (dir > 0 ? 'in' : dir < 0 ? 'out' : 'move')} aria-hidden="true">
        <Icon name={dir > 0 ? 'plus' : dir < 0 ? 'minus' : 'swap'} size={18} />
      </div>
      <div className="txn-main">
        <div className="txn-title">{title}</div>
        <div className="muted small">
          {KIND_LABEL[t.kind]} · {where}{showDate ? ` · ${friendlyDate(t.date)}` : ''}
          {t.note && title !== t.note && !t.invoiceNumber ? ` · ${t.note}` : ''}
        </div>
      </div>
      <div className={'txn-amt ' + (dir > 0 ? 'pos' : dir < 0 ? 'neg' : '')}>
        <span className="sr-only">{dir > 0 ? 'Money in' : dir < 0 ? 'Money out' : 'Moved'} </span>
        {sign}{money(t.amount)}
      </div>
      {onDelete && (
        <button className="icon-btn small-btn" onClick={() => onDelete(t)} aria-label={`Delete ${title}, ${money(t.amount)}`}>
          <Icon name="trash" size={18} />
        </button>
      )}
    </li>
  );
}

export default function Records() {
  const { business } = useSession();
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canDelete = ['owner', 'manager'].includes(business.role);

  const load = useCallback(
    async (append, after) => {
      setBusy(true);
      setError('');
      try {
        const d = await api(`/businesses/${business.id}/transactions`, {
          query: { kind, limit: 30, beforeDate: after?.date, beforeId: after?.id },
        });
        setRows((prev) => (append ? [...prev, ...d.transactions] : d.transactions));
        setHasMore(d.hasMore);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [business.id, kind]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  async function remove(t) {
    const extra = t.invoiceNumber
      ? ` ${t.invoiceNumber} will show as owed again.`
      : t.itemsSummary ? ' The stock will be put back.' : '';
    if (!window.confirm(`Delete this ${KIND_LABEL[t.kind].toLowerCase()} of GHS ${money(t.amount)}?${extra}`)) return;
    try {
      await api(`/businesses/${business.id}/transactions/${t.id}`, { method: 'DELETE' });
      setRows((r) => r.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(err.message);
    }
  }

  // Group by date for easier reading.
  const groups = [];
  for (const t of rows) {
    const g = groups.at(-1);
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }

  return (
    <>
      <main className="screen with-nav">
        <h1>Records</h1>
        <div className="segmented" role="group" aria-label="Show">
          {FILTERS.map(([value, label]) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>
          ))}
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!busy && rows.length === 0 && !error && <div className="empty">Nothing recorded here yet.</div>}
        {groups.map((g) => (
          <section key={g.date}>
            <h2 className="date-head">{friendlyDate(g.date)}</h2>
            <ul className="txn-list">
              {g.items.map((t) => <TxnRow key={t.id} t={t} onDelete={canDelete ? remove : null} />)}
            </ul>
          </section>
        ))}
        {hasMore && (
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => load(true, rows.at(-1))}>
            {busy ? 'Loading…' : 'Show older records'}
          </button>
        )}
      </main>
      <BottomNav />
    </>
  );
}
