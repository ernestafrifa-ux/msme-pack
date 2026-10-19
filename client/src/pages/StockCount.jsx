import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { FormError, TopBar } from '../components.jsx';
import { qty } from '../format';
import { useT } from '../i18n.jsx';

// Walk the shelves and type what's actually there. Only items with a
// difference are saved, as "stock count" changes.
export default function StockCount() {
  const { tt } = useT();
  const { business } = useSession();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/businesses/${business.id}/products`)
      .then((d) => setProducts(d.products.filter((p) => p.trackStock)))
      .catch((err) => setMessage(err.message));
  }, [business.id]);

  const entered = products.filter((p) => counts[p.id] !== undefined && counts[p.id] !== '');
  const differing = entered.filter((p) => Number(counts[p.id]) !== Number(p.onHand));

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const { changed } = await api(`/businesses/${business.id}/stock-count`, {
        method: 'POST',
        body: { counts: entered.map((p) => ({ productId: p.id, counted: counts[p.id] })) },
      });
      navigate('/stock', {
        replace: true,
        state: { flash: changed.length ? tt('Stock count saved: {n} item(s) corrected.', { n: changed.length }) : tt('Stock count matched your records.') },
      });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar title={tt('Stock count')} back="/stock" />
      <p className="lead">{tt('Count what is on the shelf and type the number. Leave an item empty to skip it.')}</p>
      {products.some((p) => p.kind === 'supply') && <p className="muted small">{tt('For items used in your work (relaxer, flour…), what is missing is recorded as used: a cost of your sales, not a loss.')}</p>}
      <FormError message={message} />
      <ul className="txn-list count-list">
        {products.map((p) => {
          const v = counts[p.id] ?? '';
          const diff = v === '' ? 0 : Number(v) - Number(p.onHand);
          return (
            <li key={p.id} className="txn">
              <div className="txn-main">
                <label htmlFor={`c-${p.id}`} className="txn-title">{p.name}</label>
                <div className="muted small">
                  {tt('Records say {n} {unit}', { n: qty(p.onHand), unit: p.unit })}{p.kind === 'supply' ? ` · ${tt('used in work')}` : ''}
                  {v !== '' && diff !== 0 && <strong className={diff < 0 ? 'neg' : 'pos'}> · {diff > 0 ? '+' : '−'}{qty(Math.abs(diff))}</strong>}
                </div>
              </div>
              <input id={`c-${p.id}`} className="count-input" type="number" inputMode="decimal" min="0" step="any"
                value={v} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} placeholder={qty(p.onHand)} />
            </li>
          );
        })}
      </ul>
      <div className="sticky-actions">
        <button className="btn btn-primary btn-block" disabled={busy || !entered.length} onClick={save}>
          {busy ? tt('Saving…') : entered.length
            ? tt(differing.length === 1 ? 'Save count ({n} difference)' : 'Save count ({n} differences)', { n: differing.length })
            : tt('Type at least one count')}
        </button>
      </div>
    </main>
  );
}
