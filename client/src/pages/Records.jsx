import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT, DraftLanguageBanner } from '../i18n.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { money, friendlyDate, direction } from '../format';

const FILTERS = [
  ['', 'records.all'],
  ['sale', 'records.sales'],
  ['expense', 'records.expenses'],
  ['purchase', 'records.stock'],
  ['transfer', 'records.transfers'],
  ['owner_draw', 'records.ownerPay'],
];

export function TxnRow({ txn, showDate, onDelete }) {
  const { t } = useT();
  // Stock bought on credit moves no money until the supplier is paid.
  const dir = txn.isCredit ? 0 : direction(txn.kind);
  const sign = dir > 0 ? '+' : dir < 0 ? '−' : '';
  const kindLabel = txn.isCredit ? t('kind.purchase_credit', { supplier: txn.lender || '' }) : t(`kind.${txn.kind}`);
  const where = txn.kind === 'transfer' ? `${txn.accountName} → ${txn.toAccountName}` : txn.kind === 'wht' ? t('records.whtWhere') : txn.accountName;
  const title = txn.invoiceNumber
    ? `${t('records.payment', { number: txn.invoiceNumber })}${txn.contactName ? ` · ${txn.contactName}` : ''}`
    : txn.itemsSummary || txn.categoryName || txn.assetName || txn.note || kindLabel;
  return (
    <li className="txn">
      <div className={'txn-dot ' + (dir > 0 ? 'in' : dir < 0 ? 'out' : 'move')} aria-hidden="true">
        <Icon name={dir > 0 ? 'plus' : dir < 0 ? 'minus' : txn.isCredit ? 'box' : txn.kind === 'wht' ? 'file' : 'swap'} size={18} />
      </div>
      <div className="txn-main">
        <div className="txn-title">{title}</div>
        <div className="muted small">
          {kindLabel} · {where}{showDate ? ` · ${friendlyDate(txn.date, t)}` : ''}
          {txn.note && title !== txn.note && !txn.invoiceNumber ? ` · ${txn.note}` : ''}
        </div>
      </div>
      <div className={'txn-amt ' + (dir > 0 ? 'pos' : dir < 0 ? 'neg' : '')}>
        <span className="sr-only">{t(dir > 0 ? 'records.moneyIn' : dir < 0 ? 'records.moneyOut' : 'records.moved')} </span>
        {sign}{money(txn.amount)}
      </div>
      {onDelete && (
        <button className="icon-btn small-btn" onClick={() => onDelete(txn)}
          aria-label={t('records.delete', { title, amount: money(txn.amount) })}>
          <Icon name="trash" size={18} />
        </button>
      )}
    </li>
  );
}

export default function Records() {
  const { business } = useSession();
  const { t } = useT();
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

  async function remove(txn) {
    const extra = txn.invoiceNumber
      ? ' ' + t('records.confirmInvoice', { number: txn.invoiceNumber })
      : txn.itemsSummary ? ' ' + t('records.confirmStock') : '';
    const question = t('records.confirmDelete', { kind: t(`kind.${txn.kind}`).toLowerCase(), amount: money(txn.amount) });
    if (!window.confirm(question + extra)) return;
    try {
      await api(`/businesses/${business.id}/transactions/${txn.id}`, { method: 'DELETE' });
      setRows((r) => r.filter((x) => x.id !== txn.id));
    } catch (err) {
      setError(err.message);
    }
  }

  // Group by date for easier reading.
  const groups = [];
  for (const txn of rows) {
    const g = groups.at(-1);
    if (g && g.date === txn.date) g.items.push(txn);
    else groups.push({ date: txn.date, items: [txn] });
  }

  return (
    <>
      <main className="screen with-nav">
        <div className="card-head">
          <h1>{t('records.title')}</h1>
          <Link to="/reports" className="small">{t('st.title')}</Link>
        </div>
        <DraftLanguageBanner />
        <div className="segmented filters" role="group" aria-label={t('records.show')}>
          {FILTERS.map(([value, key]) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{t(key)}</button>
          ))}
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!busy && rows.length === 0 && !error && <div className="empty">{t('records.empty')}</div>}
        {groups.map((g) => (
          <section key={g.date}>
            <h2 className="date-head">{friendlyDate(g.date, t)}</h2>
            <ul className="txn-list">
              {g.items.map((x) => <TxnRow key={x.id} txn={x} onDelete={canDelete ? remove : null} />)}
            </ul>
          </section>
        ))}
        {hasMore && (
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => load(true, rows.at(-1))}>
            {busy ? t('common.loading') : t('records.older')}
          </button>
        )}
      </main>
      <BottomNav />
    </>
  );
}
