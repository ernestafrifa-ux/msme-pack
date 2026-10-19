import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';

// The owner's choice: share summary figures with the MSME Pack team for programme reports.
export default function SharingSection() {
  const { business } = useSession();
  const [on, setOn] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api(`/businesses/${business.id}`).then((d) => setOn(!!d.business.shareWithProgramme)).catch(() => {});
  }, [business.id]);
  if (business.role !== 'owner' || on === null) return null;
  async function toggle(e) {
    const v = e.target.checked;
    try {
      const d = await api(`/businesses/${business.id}`, { method: 'PATCH', body: { shareWithProgramme: v } });
      setOn(d.business.shareWithProgramme);
      setMessage(v ? 'Thank you. Your summary figures are now shared with the MSME Pack team.' : 'Sharing is off. The team no longer sees your figures.');
    } catch (err) { setMessage(err.message); }
  }
  return (
    <section className="card" aria-labelledby="share-head">
      <h2 id="share-head">Help the programme</h2>
      <label className="check-row top">
        <input type="checkbox" checked={on} onChange={toggle} />
        <span>Share my summary figures with the MSME Pack team
          <span className="small muted block">Monthly sales, profit and your health check score, used to report on and improve support for businesses like yours. Never your customers, records or balances. You can turn this off at any time.</span>
        </span>
      </label>
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
