import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import BizLogo from '../BizLogo.jsx';

// Groups of businesses: a programme intake, a district, a training class.
export default function AdminGroups() {
  const [groups, setGroups] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [editing, setEditing] = useState(null); // null, 'new' or a group
  const [f, setF] = useState({ name: '', description: '', businessIds: [] });
  const [q, setQ] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    api('/admin/groups').then((d) => setGroups(d.groups)).catch((err) => setMessage(err.message));
    api('/admin/businesses').then((d) => setBusinesses(d.businesses)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(g) {
    setEditing(g);
    setErrors({}); setMessage('');
    setF(g === 'new' ? { name: '', description: '', businessIds: [] }
      : { name: g.name, description: g.description || '', businessIds: businesses.filter((b) => b.groupIds.includes(g.id)).map((b) => b.id) });
  }
  async function save(e) {
    e.preventDefault();
    setErrors({}); setMessage('');
    try {
      const body = { name: f.name, description: f.description || null, businessIds: f.businessIds };
      const d = editing === 'new' ? await api('/admin/groups', { method: 'POST', body }) : await api(`/admin/groups/${editing.id}`, { method: 'PUT', body });
      setGroups(d.groups); setEditing(null); setFlash(`${f.name} saved with ${f.businessIds.length} business${f.businessIds.length === 1 ? '' : 'es'}.`);
      api('/admin/businesses').then((x) => setBusinesses(x.businesses));
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); }
  }
  async function remove() {
    if (!window.confirm(`Delete the group "${editing.name}"? The businesses stay on the platform.`)) return;
    const d = await api(`/admin/groups/${editing.id}`, { method: 'DELETE' });
    setGroups(d.groups); setEditing(null);
  }
  const toggle = (id) => setF({ ...f, businessIds: f.businessIds.includes(id) ? f.businessIds.filter((x) => x !== id) : [...f.businessIds, id] });
  const shown = businesses.filter((b) => !q || `${b.name} ${b.town || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="screen">
      <TopBar title="Groups" back="/admin" />
      <p className="lead">Put businesses in groups, such as a programme intake or a district, to send them messages and see their progress together.</p>
      {flash && <div className="flash" role="status">{flash}</div>}
      {!editing && (
        <>
          <ul className="txn-list">
            {(groups || []).map((g) => (
              <li key={g.id}>
                <button type="button" className="txn report-link plain-btn" onClick={() => open(g)}>
                  <span className="txn-main">
                    <span className="txn-title wrap">{g.name}</span>
                    <span className="small muted">{g.businesses} business{g.businesses === 1 ? '' : 'es'}{g.description ? ` · ${g.description}` : ''}</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {groups && !groups.length && <p className="muted">No groups yet.</p>}
          <button type="button" className="btn btn-primary btn-block" onClick={() => open('new')}><Icon name="plus" size={18} /> New group</button>
        </>
      )}
      {editing && (
        <form className="card stack" onSubmit={save} noValidate>
          <FormError message={message} />
          <Field label="Group name" error={errors.name}>
            {(p) => <input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. BizBox Kwahu West 2026" />}
          </Field>
          <Field label="Description (optional)">
            {(p) => <input {...p} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}
          </Field>
          <fieldset className="field">
            <legend>Businesses in the group ({f.businessIds.length})</legend>
            {businesses.length > 8 && <input type="search" className="search-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search businesses" />}
            <div className="stack-tight">
              {shown.map((b) => (
                <label key={b.id} className="check-row normal">
                  <input type="checkbox" checked={f.businessIds.includes(b.id)} onChange={() => toggle(b.id)} />
                  <BizLogo business={b} size={28} /><span>{b.name}{b.town ? <span className="muted"> · {b.town}</span> : null}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary">Save group</button>
          </div>
          {editing !== 'new' && <button type="button" className="btn-link small danger align-start" onClick={remove}>Delete this group</button>}
        </form>
      )}
    </main>
  );
}
