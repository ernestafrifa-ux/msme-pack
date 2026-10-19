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
