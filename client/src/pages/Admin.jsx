import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { FormError, Icon, TopBar } from '../components.jsx';
import { longDate, friendlyDate } from '../format';

function OwnerRow({ o, onDone }) {
  const [mode, setMode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  async function resetPw(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api(`/admin/users/${o.userId}/reset-password`, { method: 'POST', body: { password } });
      setMode(''); setPassword('');
      onDone(`New temporary password set for ${o.fullName}. They choose their own at next login.`);
    } catch (err) { setMessage(err.message); }
  }
  async function toggle() {
    try {
      await api(`/admin/users/${o.userId}`, { method: 'PATCH', body: { isActive: !o.isActive } });
      onDone(o.isActive ? `${o.fullName} can no longer log in.` : `${o.fullName} can log in again.`, true);
    } catch (err) { setMessage(err.message); }
  }
  return (
    <div className="stack-tight">
      <span className="small">Owner: <span className="strong">{o.fullName}</span> · {o.phone.replace('+233', '0')}
        {o.mustChangePassword ? ' · has not logged in yet' : ''}{!o.isActive ? ' · switched off' : ''}</span>
      {mode === 'reset' ? (
        <form className="inline-form" onSubmit={resetPw}>
          <input aria-label={`Temporary password for ${o.fullName}`} placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary">Save</button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('')}>Cancel</button>
        </form>
      ) : (
        <span className="asset-actions">
          <button type="button" className="btn-link small" onClick={() => setMode('reset')}>New password</button>
          <button type="button" className="btn-link small danger" onClick={toggle}>{o.isActive ? 'Switch off' : 'Switch on'}</button>
        </span>
      )}
      {message && <span className="field-error">{message}</span>}
    </div>
  );
}

// The MSME Pack admin's home: every business and its owner. The admin does not see records.
export default function Admin() {
  const { business, logout } = useSession();
  const { t } = useT();
  const location = useLocation();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api('/admin/businesses').then((d) => setList(d.businesses)).catch((err) => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (list || []).filter((b) => !q || `${b.name} ${b.town || ''} ${b.owners.map((o) => `${o.fullName} ${o.phone}`).join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="screen">
      {business ? <TopBar title="MSME Pack admin" back="/settings" /> : (
        <header className="topbar">
          <h1 className="topbar-title">MSME Pack admin</h1>
          <button type="button" className="btn-link" onClick={logout}>Log out</button>
        </header>
      )}
      <p className="lead">You set up each business and its owner. Owners then add their own staff. You do not see a business&rsquo;s records.</p>
      {flash && <div className="flash" role="status">{flash}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <Link to="/admin/new" className="btn btn-primary btn-block"><Icon name="plus" size={18} /> Set up a new business</Link>
      {list && list.length > 4 && (
        <label className="field"><span className="field-label">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business, town, owner or phone" /></label>
      )}
      {list && (
        <section className="card">
          <h2>{list.length} business{list.length === 1 ? '' : 'es'}</h2>
          {shown.map((b) => (
            <div key={b.id} className="biz-row">
              <span className="strong">{b.name}{!b.setupDone && <span className="tag tag-warn">waiting for owner</span>}</span>
              <span className="small muted">
                {[b.sector, b.town, b.region].filter(Boolean).join(' · ')}
              </span>
              <span className="small muted">
                Set up {longDate(b.createdAt.slice(0, 10), t)} · {b.people} {b.people === 1 ? 'person' : 'people'}
                {b.lastRecord ? ` · last record ${friendlyDate(b.lastRecord, t)}` : ' · no records yet'}
              </span>
              {b.owners.map((o) => <OwnerRow key={o.userId} o={o} onDone={(m, reload) => { setFlash(m); if (reload) load(); }} />)}
            </div>
          ))}
          {!list.length && <p className="muted">No businesses yet.</p>}
        </section>
      )}
    </main>
  );
}
