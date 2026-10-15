import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT, DraftLanguageBanner } from '../i18n.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { RecommendationList } from './Health.jsx';

export default function Learn() {
  const { business } = useSession();
  const { t, lang } = useT();
  const [guides, setGuides] = useState(null);
  const [recs, setRecs] = useState([]);
  const [hasCheck, setHasCheck] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/guides').then((d) => setGuides(d.guides)).catch((err) => setError(err.message));
    api(`/businesses/${business.id}/health`)
      .then((d) => { setRecs(d.recommendations); setHasCheck(!!d.latest); })
      .catch(() => {});
  }, [business.id, lang]);

  const areas = [];
  for (const g of guides || []) {
    const a = areas.at(-1);
    if (a && a.code === g.areaCode) a.items.push(g);
    else areas.push({ code: g.areaCode, items: [g] });
  }
  const doneCount = (guides || []).filter((g) => g.progress === 'completed').length;

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>{t('learn.title')}</h1>
          {guides && <span className="muted small">{t('learn.read', { a: doneCount, n: guides.length })}</span>}
        </header>
        <DraftLanguageBanner />
        {error && <div className="form-error" role="alert">{error}</div>}

        {recs.length > 0 ? (
          <section>
            <div className="card-head"><h2>{t('learn.first')}</h2></div>
            <RecommendationList items={recs.slice(0, 3)} />
          </section>
        ) : !hasCheck && (
          <Link to="/health" className="alert">
            <Icon name="alert" size={20} />
            <span>{t('learn.takeCheck')}</span>
          </Link>
        )}

        {areas.map((a) => (
          <section key={a.code}>
            <div className="card-head"><h2>{t(`area.${a.code}`)}</h2></div>
            <ul className="txn-list">
              {a.items.map((g) => {
                const hasAudio = g.audio.some((x) => x.language === lang);
                return (
                  <li key={g.slug}>
                    <Link to={`/learn/${g.slug}`} className="product-row" lang={g.language}>
                      <span className="txn-main">
                        <span className="txn-title wrap">{g.title}</span>
                        <span className="muted small">
                          {t('learn.minRead', { n: g.readMinutes })}
                          {hasAudio ? ` · ${t('learn.audio')}` : ''}
                          {g.isDraft && <> · <span className="draft-tag">{t('learn.draft')}</span></>}
                        </span>
                      </span>
                      {g.progress === 'completed' && <span className="pill pill-paid">{t('learn.readBadge')}</span>}
                      <Icon name="chevron" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
      <BottomNav />
    </>
  );
}
