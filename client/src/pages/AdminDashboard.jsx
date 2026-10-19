import { useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, friendlyDate, monthName } from '../format';
import { downloadCsv } from '../statements.jsx';

// Programme dashboard: activity for every business; money figures only where the owner agreed to share.
export default function AdminDashboard() {
  const { t } = useT();
  const [lookups, setLookups] = useState({ regions: [], sectors: [] });
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState({ groupId: '', regionCode: '', sectorCode: '', months: 3 });
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/businesses/lookups').then(setLookups).catch(() => {});
    api('/admin/groups').then((x) => setGroups(x.groups)).catch(() => {});
  }, []);
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    api(`/admin/dashboard?${qs}`).then(setD).catch((err) => setError(err.message));
  }, [filter]);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const maxRecords = d ? Math.max(1, ...d.monthly.map((m) => m.records)) : 1;

  function csv() {
    downloadCsv(`programme-${d.from}-to-${d.to}.csv`, [
      ['Business', 'Town', 'Region', 'Sector', 'Records', 'Days recorded', 'Last record', 'Shares figures', 'Sales', 'Profit', 'Health score'],
      ...d.businesses.map((b) => [b.name, b.town, b.region, b.sector, b.records, b.daysRecorded, b.lastRecord || '', b.sharing ? 'yes' : 'no', b.sales ?? '', b.profit ?? '', b.health ?? '']),
    ]);
  }

  return (
    <main className="screen">
      <TopBar title="Programme dashboard" back="/admin" />
      <div className="grid-2">
        <label className="field"><span className="field-label">Group</span>
          <select value={filter.groupId} onChange={set('groupId')}><option value="">All businesses</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Period</span>
          <select value={filter.months} onChange={set('months')}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? 'This month' : `Last ${m} months`}</option>)}</select></label>
        <label className="field"><span className="field-label">Region</span>
          <select value={filter.regionCode} onChange={set('regionCode')}><option value="">All</option>{lookups.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Sector</span>
          <select value={filter.sectorCode} onChange={set('sectorCode')}><option value="">All</option>{lookups.sectors.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {d && (
        <>
          <div className="pack-tiles dash-tiles">
            <div className="pack-tile"><div className="muted small">Businesses</div><div className="pack-tile-val">{d.counts.businesses}</div><div className="muted small">{d.counts.setUp} set up</div></div>
            <div className="pack-tile"><div className="muted small">Active (last 30 days)</div><div className="pack-tile-val">{d.counts.active30}</div><div className="muted small">{d.counts.businesses ? Math.round((d.counts.active30 / d.counts.businesses) * 100) : 0}%</div></div>
            <div className="pack-tile"><div className="muted small">Records in the period</div><div className="pack-tile-val">{d.counts.records.toLocaleString()}</div></div>
            <div className="pack-tile"><div className="muted small">Sharing figures</div><div className="pack-tile-val">{d.counts.sharing}</div><div className="muted small">of {d.counts.businesses}</div></div>
          </div>

          <section className="card">
            <h2>Records each month</h2>
            {d.monthly.map((m) => (
              <div key={m.month} className="progress-line">
                <div className="statement-row small"><span>{monthName(m.month, t)} {m.month.slice(0, 4)}</span><span className="muted">{m.records} record{m.records === 1 ? '' : 's'} · {m.businesses} business{m.businesses === 1 ? '' : 'es'}</span></div>
                <div className="bar"><div style={{ width: `${(m.records / maxRecords) * 100}%` }} /></div>
              </div>
            ))}
            {!d.monthly.length && <p className="muted small">No records in this period.</p>}
          </section>

          <section className="card">
            <h2>Businesses sharing figures ({d.counts.sharing})</h2>
            {d.counts.sharing === 0 ? <p className="muted small">No business in this view has chosen to share its figures. Owners can turn it on in Settings.</p> : (
              <table className="statement-table"><tbody>
                <tr><td>Total sales in the period</td><td className="num">GHS {money(d.shared.totalSales)}</td></tr>
                <tr><td>Average sales per business</td><td className="num">GHS {money(d.shared.averageSales)}</td></tr>
                <tr><td>Making a profit</td><td className="num">{d.shared.profitable} of {d.counts.sharing}</td></tr>
                <tr><td>Median sales growth</td><td className="num">{d.shared.medianGrowth === null ? '—' : `${d.shared.medianGrowth}%`}</td></tr>
                <tr><td>Average health check score</td><td className="num">{d.shared.averageHealth ?? '—'}{d.shared.healthCount ? ` (${d.shared.healthCount} checks)` : ''}</td></tr>
              </tbody></table>
            )}
          </section>

          <section className="card">
            <h2>Each business</h2>
            <div className="table-scroll">
              <table className="pack-table">
                <thead><tr><th>Business</th><th className="num">Records</th><th>Last record</th><th className="num">Sales</th><th className="num">Profit</th><th className="num">Health</th></tr></thead>
                <tbody>
                  {d.businesses.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}<div className="muted small">{[b.town, b.region].filter(Boolean).join(', ')}</div></td>
                      <td className="num">{b.records}</td>
                      <td>{b.lastRecord ? friendlyDate(b.lastRecord, t) : '—'}</td>
                      <td className="num">{b.sharing ? money(b.sales) : <span className="muted">not shared</span>}</td>
                      <td className={'num' + (b.sharing && Number(b.profit) < 0 ? ' neg' : '')}>{b.sharing ? money(b.profit) : ''}</td>
                      <td className="num">{b.health ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-ghost btn-block" onClick={csv}>Download for a spreadsheet</button>
          </section>
        </>
      )}
    </main>
  );
}
