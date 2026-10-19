import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { friendlyDate } from '../format';
import BizLogo from '../BizLogo.jsx';

const AUDIENCES = [['all', 'All businesses'], ['group', 'A group'], ['region', 'By region'], ['sector', 'By sector'], ['selected', 'Choose businesses']];

function audienceText(a, lookups) {
  const names = (list, codes) => codes.map((c) => list.find((x) => x.code === c)?.name || c).join(', ');
  if (a.type === 'region') return `Region: ${names(lookups.regions, a.codes)}`;
  if (a.type === 'sector') return `Sector: ${names(lookups.sectors, a.codes)}`;
  if (a.type === 'selected') return 'Chosen businesses';
  if (a.type === 'group') return `Group: ${a.groupIds.map((id) => lookups.groups?.find((g) => g.id === id)?.name || 'removed').join(', ')}`;
  return 'All businesses';
}

// The admin writes a message to businesses and sees how many have read earlier ones.
export default function AdminNotices() {
  const { t } = useT();
  const [lookups, setLookups] = useState({ regions: [], sectors: [] });
  const [businesses, setBusinesses] = useState([]);
  const [sent, setSent] = useState(null);
  const [f, setF] = useState({ title: '', body: '', linkUrl: '', type: 'all', codes: [], businessIds: [], groupIds: [], question: '', options: '' });
  const [groups, setGroups] = useState([]);
  const [smsOn, setSmsOn] = useState(false);
  const [alsoSms, setAlsoSms] = useState(false);
  const [reach, setReach] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const audience = f.type === 'all' ? { type: 'all' }
    : f.type === 'selected' ? { type: 'selected', businessIds: f.businessIds }
    : f.type === 'group' ? { type: 'group', groupIds: f.groupIds }
    : { type: f.type, codes: f.codes };
  const audienceKey = JSON.stringify(audience);

  const loadSent = useCallback(() => api('/admin/notices').then((d) => setSent(d.notices)).catch((err) => setMessage(err.message)), []);
  useEffect(() => {
    api('/businesses/lookups').then(setLookups).catch(() => {});
    api('/admin/businesses').then((d) => setBusinesses(d.businesses)).catch(() => {});
    api('/admin/groups').then((d) => setGroups(d.groups)).catch(() => {});
    api('/admin/sms').then((d) => setSmsOn(d.enabled)).catch(() => {});
    loadSent();
  }, [loadSent]);
  useEffect(() => {
    const a = JSON.parse(audienceKey);
    if ((a.codes && !a.codes.length) || (a.businessIds && !a.businessIds.length) || (a.groupIds && !a.groupIds.length)) { setReach(null); return; }
    api('/admin/notices/preview', { method: 'POST', body: { audience: a } }).then(setReach).catch(() => setReach(null));
  }, [audienceKey]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });

  async function send(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setFlash('');
    try {
      const options = f.options.split('\n').map((o) => o.trim()).filter(Boolean);
      const d = await api('/admin/notices', { method: 'POST', body: { title: f.title, body: f.body, linkUrl: f.linkUrl || null, audience,
        question: f.question || null, options: f.question ? options : null, sms: smsOn && alsoSms } });
      setFlash(`Message sent to ${d.businesses} business${d.businesses === 1 ? '' : 'es'}. They see it on their Home screen.${d.sms ? ` SMS: ${d.sms.sent} sent${d.sms.failed ? `, ${d.sms.failed} failed` : ''}.` : ''}`);
      setF({ title: '', body: '', linkUrl: '', type: 'all', codes: [], businessIds: [], groupIds: [], question: '', options: '' });
      loadSent();
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  }
  async function withdraw(n) {
    try { await api(`/admin/notices/${n.id}`, { method: 'DELETE' }); setFlash(`"${n.title}" withdrawn.`); loadSent(); } catch (err) { setMessage(err.message); }
  }

  const choices = f.type === 'region' ? lookups.regions : f.type === 'sector' ? lookups.sectors : [];

  return (
    <main className="screen">
      <TopBar title="Messages to businesses" back="/admin" />
      {flash && <div className="flash" role="status">{flash}</div>}
      <form className="card stack" onSubmit={send} noValidate>
        <h2>New message</h2>
        <FormError message={message} />
        <Field label="Title" error={errors.title}>
          {(p) => <input {...p} value={f.title} onChange={set('title')} placeholder="e.g. Free record-keeping training on Friday" maxLength={120} />}
        </Field>
        <Field label="Message" error={errors.body}>
          {(p) => <textarea {...p} rows={5} value={f.body} onChange={set('body')} maxLength={2000} />}
        </Field>
        <Field label="Link (optional)" error={errors.linkUrl} hint="An app page like /learn/tax-basics, or a web link starting https://">
          {(p) => <input {...p} value={f.linkUrl} onChange={set('linkUrl')} inputMode="url" />}
        </Field>
        <fieldset className="field">
          <legend>Send to</legend>
          <div className="options">
            {AUDIENCES.map(([k, label]) => (
              <label key={k} className={'option' + (f.type === k ? ' option-on' : '')}>
                <input type="radio" name="audience" value={k} checked={f.type === k}
                  onChange={() => setF({ ...f, type: k, codes: [], businessIds: [], groupIds: [] })} />
                {label}
              </label>
            ))}
          </div>
          {choices.length > 0 && (
            <div className="chips">
              {choices.map((c) => (
                <label key={c.code} className={'chip' + (f.codes.includes(c.code) ? ' chip-on' : '')}>
                  <input type="checkbox" checked={f.codes.includes(c.code)} onChange={() => toggle('codes', c.code)} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          {f.type === 'group' && (
            <div className="chips">
              {groups.map((g) => (
                <label key={g.id} className={'chip' + (f.groupIds.includes(g.id) ? ' chip-on' : '')}>
                  <input type="checkbox" checked={f.groupIds.includes(g.id)} onChange={() => toggle('groupIds', g.id)} />
                  {g.name} ({g.businesses})
                </label>
              ))}
              {!groups.length && <span className="muted small">No groups yet. Make one under Groups.</span>}
            </div>
          )}
          {f.type === 'selected' && (
            <div className="stack-tight">
              {businesses.map((b) => (
                <label key={b.id} className="check-row normal">
                  <input type="checkbox" checked={f.businessIds.includes(b.id)} onChange={() => toggle('businessIds', b.id)} />
                  <BizLogo business={b} size={28} /> <span>{b.name}{b.town ? <span className="muted"> · {b.town}</span> : null}</span>
                </label>
              ))}
            </div>
          )}
          {(errors['audience.codes'] || errors['audience.businessIds'] || errors['audience.groupIds']) && <div className="field-error">{errors['audience.codes'] || errors['audience.businessIds'] || errors['audience.groupIds']}</div>}
        </fieldset>
        <Field label="Question (optional)" error={errors.question} hint="e.g. Will you attend the training?">
          {(p) => <input {...p} value={f.question} onChange={set('question')} maxLength={200} />}
        </Field>
        {f.question && (
          <Field label="Answers to choose from, one per line" error={errors.options}>
            {(p) => <textarea {...p} rows={3} value={f.options} onChange={set('options')} placeholder={'Yes\nNo\nNot sure'} />}
          </Field>
        )}
        {smsOn && (
          <label className="check-row normal">
            <input type="checkbox" checked={alsoSms} onChange={(e) => setAlsoSms(e.target.checked)} />
            <span>Also send a text message (SMS) to each business owner</span>
          </label>
        )}
        {reach && <p className="small">This reaches <strong>{reach.businesses}</strong> business{reach.businesses === 1 ? '' : 'es'} ({reach.people} {reach.people === 1 ? 'person' : 'people'}).</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !reach?.businesses}>{busy ? 'Sending…' : 'Send message'}</button>
      </form>

      {sent && sent.length > 0 && (
        <section className="card">
          <h2>Sent</h2>
          {sent.map((n) => (
            <article key={n.id} className="msg-item">
              <h2>{n.title}{n.withdrawn && <span className="tag">withdrawn</span>}</h2>
              <div className="small muted">{friendlyDate(n.sentAt.slice(0, 10), t)} · {audienceText(n.audience, { ...lookups, groups })}</div>
              <p className="notice-body small">{n.body}</p>
              <div className="small">Read in <strong>{n.readBy}</strong> of {n.businesses} business{n.businesses === 1 ? '' : 'es'}</div>
              {n.answers && (
                <div className="stack-tight survey-results">
                  <div className="small strong">{n.question}</div>
                  {n.answers.map((a) => (
                    <div key={a.option} className="progress-line">
                      <div className="statement-row small"><span>{a.option}</span><span className="muted">{a.count}</span></div>
                      <div className="bar"><div style={{ width: `${n.businesses ? (a.count / n.businesses) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {!n.withdrawn && <button type="button" className="btn-link small danger" onClick={() => withdraw(n)}>Withdraw</button>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
