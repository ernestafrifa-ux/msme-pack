import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT, DraftLanguageBanner } from '../i18n.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { longDate } from '../format';

// The label also reflects the weakest area, so a high average can't hide a serious gap.
export function scoreWordKey(score, weakest = 100) {
  if (weakest < 40 && score >= 40) return 'health.word.weakSpot';
  if (score >= 80) return 'health.word.strong';
  if (score >= 60) return 'health.word.good';
  if (score >= 40) return 'health.word.getting';
  return 'health.word.starting';
}

export function RecommendationList({ items }) {
  const { t } = useT();
  return (
    <ol className="steps-list">
      {items.map((r, i) => (
        <li key={r.slug}>
          <Link to={`/learn/${r.slug}`} className="step-row">
            <span className="step-num" aria-hidden="true">{i + 1}</span>
            <span className="txn-main">
              <span className="txn-title wrap">{r.title}</span>
              <span className="muted small">{t('health.stepMeta', { area: t(`area.${r.areaCode}`), n: r.readMinutes })}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function Health() {
  const { business } = useSession();
  const { t } = useT();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const canAnswer = ['owner', 'manager'].includes(business.role);
  const justFinished = location.state?.justFinished;

  useEffect(() => {
    api(`/businesses/${business.id}/health`).then(setData).catch((err) => setError(err.message));
  }, [business.id]);

  const latest = data?.latest;
  const startLabel = data?.inProgress
    ? t('health.continue', { a: data.inProgress.answered, n: data.questionCount })
    : latest ? t('health.again') : t('health.start');

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>{t('health.title')}</h1>
        </header>
        <DraftLanguageBanner />
        {error && <div className="form-error" role="alert">{error}</div>}

        {data && !latest && (
          <section className="intro card">
            <h2>{t('health.introTitle')}</h2>
            <p>{t('health.intro1', { n: data.questionCount })}</p>
            <p>{t('health.intro2')}</p>
          </section>
        )}

        {latest && (
          <>
            {justFinished && <div className="flash" role="status">{t('health.done')}</div>}
            <section className="money-card score-card" aria-label={t('health.yourScore')}>
              <div className="score-ring" aria-hidden="true" style={{ '--pct': latest.overallScore }}>
                <span>{latest.overallScore}</span>
              </div>
              <div>
                <div className="score-word">
                  {t(scoreWordKey(latest.overallScore, Math.min(...latest.areas.map((a) => a.score))))}
                </div>
                <div className="money-label">
                  <span className="sr-only">{t('health.scoreSr', { n: latest.overallScore })} </span>
                  {t('health.checked', { date: longDate(latest.completedAt.slice(0, 10)) })}
                  {latest.previousScore !== undefined && (
                    <> · {t(latest.overallScore >= latest.previousScore ? 'health.up' : 'health.down', { n: latest.previousScore })}</>
                  )}
                </div>
              </div>
            </section>

            <section className="card" aria-label={t('health.byArea')}>
              <ul className="area-bars">
                {latest.areas.map((a) => (
                  <li key={a.code}>
                    <div className="area-line"><span>{t(`area.${a.code}`)}</span><strong>{a.score}</strong></div>
                    <div className="bar" aria-hidden="true"><div className={a.score < 50 ? 'bar-low' : ''} style={{ width: a.score + '%' }} /></div>
                  </li>
                ))}
              </ul>
            </section>

            {data.recommendations.length > 0 ? (
              <section>
                <div className="card-head"><h2>{t('health.next')}</h2></div>
                <RecommendationList items={data.recommendations.slice(0, 5)} />
                {data.recommendations.length > 5 && (
                  <p className="muted small"><Link to="/learn">{t('health.more', { n: data.recommendations.length - 5 })}</Link></p>
                )}
              </section>
            ) : (
              <div className="empty"><Link to="/learn">{t('health.noSteps')}</Link></div>
            )}
          </>
        )}

        {data && canAnswer && (
          <Link to="/health/check" className={'btn btn-block ' + (latest && !data.inProgress ? 'btn-ghost' : 'btn-primary')}>
            {startLabel}
          </Link>
        )}
        {data && !canAnswer && !latest && <p className="muted">{t('health.askOwner')}</p>}
      </main>
      <BottomNav />
    </>
  );
}
