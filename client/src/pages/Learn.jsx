import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { RecommendationList } from './Health.jsx';

export default function Learn() {
  const { business } = useSession();
  const [guides, setGuides] = useState(null);
  const [recs, setRecs] = useState([]);
  const [hasCheck, setHasCheck] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/guides').then((d) => setGuides(d.guides)).catch((err) => setError(err.message));
    api(`/businesses/${business.id}/health`)
      .then((d) => { setRecs(d.recommendations); setHasCheck(!!d.latest); })
      .catch(() => {});
  }, [business.id]);

  const areas = [];
  for (const g of guides || []) {
    const a = areas.at(-1);
    if (a && a.code === g.areaCode) a.items.push(g);
    else areas.push({ code: g.areaCode, name: g.areaName, items: [g] });
  }
  const doneCount = (guides || []).filter((g) => g.progress === 'completed').length;

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>Learn</h1>
          {guides && <span className="muted small">{doneCount} of {guides.length} read</span>}
        </header>
        {error && <div className="form-error" role="alert">{error}</div>}

        {recs.length > 0 ? (
          <section>
            <div className="card-head"><h2>Read these first</h2></div>
            <RecommendationList items={recs.slice(0, 3)} />
          </section>
        ) : !hasCheck && (
          <Link to="/health" className="alert">
            <Icon name="alert" size={20} />
            <span>Take the <strong>business health check</strong> to see which guides matter most for you.</span>
          </Link>
        )}

        {areas.map((a) => (
          <section key={a.code}>
            <div className="card-head"><h2>{a.name}</h2></div>
            <ul className="txn-list">
              {a.items.map((g) => (
                <li key={g.slug}>
                  <Link to={`/learn/${g.slug}`} className="product-row">
                    <span className="txn-main">
                      <span className="txn-title wrap">{g.title}</span>
                      <span className="muted small">{g.readMinutes} min read{g.audioUrl ? ' · audio' : ''}</span>
                    </span>
                    {g.progress === 'completed' && <span className="pill pill-paid">Read</span>}
                    <Icon name="chevron" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <BottomNav />
    </>
  );
}
