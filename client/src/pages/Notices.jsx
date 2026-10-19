import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { friendlyDate } from '../format';

// Messages from the MSME Pack team. Opening this page marks them as read.
export default function Notices() {
  const { business } = useSession();
  const { t } = useT();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/businesses/${business.id}/notices`)
      .then((d) => {
        setList(d.notices);
        if (d.unread) api(`/businesses/${business.id}/notices/read`, { method: 'POST' }).catch(() => {});
      })
      .catch((err) => setError(err.message));
  }, [business.id]);

  return (
    <main className="screen">
      <TopBar title="Messages" back="/" />
      <p className="lead">News and opportunities from the MSME Pack team.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {list && !list.length && <p className="muted">No messages yet.</p>}
      {list && list.length > 0 && (
        <section className="card">
          {list.map((n) => (
            <article key={n.id} className="msg-item">
              <h2>{n.title}{!n.read && <span className="tag tag-warn">new</span>}</h2>
              <div className="small muted">{friendlyDate(n.sentAt.slice(0, 10), t)}</div>
              <p className="notice-body">{n.body}</p>
              {n.question && (
                <div className="stack-tight survey">
                  <div className="strong small">{n.question}</div>
                  <div className="chips">
                    {n.options.map((o, i) => (
                      <button key={i} type="button" className={'chip' + (n.answer === i ? ' chip-on' : '')} aria-pressed={n.answer === i}
                        onClick={() => api(`/businesses/${business.id}/notices/${n.id}/answer`, { method: 'POST', body: { option: i } })
                          .then(() => setList((l) => l.map((x) => (x.id === n.id ? { ...x, answer: i } : x))))
                          .catch((err) => setError(err.message))}>
                        {o}
                      </button>
                    ))}
                  </div>
                  {n.answer !== null && <div className="small muted">Thank you. You can change your answer.</div>}
                </div>
              )}
              {n.linkUrl && (n.linkUrl.startsWith('/')
                ? <Link to={n.linkUrl} className="btn-link small">Open</Link>
                : <a href={n.linkUrl} target="_blank" rel="noopener noreferrer" className="btn-link small">Open link</a>)}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
