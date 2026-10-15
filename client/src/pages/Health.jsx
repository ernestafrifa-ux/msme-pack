import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { longDate } from '../format';

// The label also reflects the weakest area, so a high average can't hide a serious gap.
export function scoreWord(score, weakest = 100) {
  if (weakest < 40 && score >= 40) return 'Good in places, one area needs work';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Good, with room to grow';
  if (score >= 40) return 'Getting there';
  return 'Just starting';
}

export function RecommendationList({ items }) {
  return (
    <ol className="steps-list">
      {items.map((r, i) => (
        <li key={r.slug}>
          <Link to={`/learn/${r.slug}`} className="step-row">
            <span className="step-num" aria-hidden="true">{i + 1}</span>
            <span className="txn-main">
              <span className="txn-title wrap">{r.title}</span>
              <span className="muted small">{r.areaName} · {r.readMinutes} min read</span>
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
    ? `Continue (${data.inProgress.answered} of ${data.questionCount} answered)`
    : latest ? 'Take the check again' : 'Start the health check';

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>Business health</h1>
        </header>
        {error && <div className="form-error" role="alert">{error}</div>}

        {data && !latest && (
          <section className="intro card">
            <h2>How healthy is your business?</h2>
            <p>Answer {data.questionCount} quick questions about money, registration, stock, customers, staff and finance. It takes about 5 minutes.</p>
            <p>You'll get a score for each area and a short list of guides to read first. Your answers are private to your business.</p>
          </section>
        )}

        {latest && (
          <>
            {justFinished && <div className="flash" role="status">Done. Here is your result.</div>}
            <section className="money-card score-card" aria-label="Your score">
              <div className="score-ring" aria-hidden="true" style={{ '--pct': latest.overallScore }}>
                <span>{latest.overallScore}</span>
              </div>
              <div>
                <div className="score-word">{scoreWord(latest.overallScore, Math.min(...latest.areas.map((a) => a.score)))}</div>
                <div className="money-label">
                  <span className="sr-only">Score {latest.overallScore} out of 100. </span>
                  Checked {longDate(latest.completedAt.slice(0, 10))}
                  {latest.previousScore !== undefined && (
                    <> · {latest.overallScore >= latest.previousScore ? 'up' : 'down'} from {latest.previousScore}</>
                  )}
                </div>
              </div>
            </section>

            <section className="card" aria-label="Score by area">
              <ul className="area-bars">
                {latest.areas.map((a) => (
                  <li key={a.code}>
                    <div className="area-line"><span>{a.name}</span><strong>{a.score}</strong></div>
                    <div className="bar" aria-hidden="true"><div className={a.score < 50 ? 'bar-low' : ''} style={{ width: a.score + '%' }} /></div>
                  </li>
                ))}
              </ul>
            </section>

            {data.recommendations.length > 0 ? (
              <section>
                <div className="card-head"><h2>Your next steps</h2></div>
                <RecommendationList items={data.recommendations.slice(0, 5)} />
                {data.recommendations.length > 5 && (
                  <p className="muted small">And {data.recommendations.length - 5} more in <Link to="/learn">Learn</Link>.</p>
                )}
              </section>
            ) : (
              <div className="empty">No open steps. Well done. Browse <Link to="/learn">Learn</Link> for more ideas, and check again in a few months.</div>
            )}
          </>
        )}

        {data && canAnswer && (
          <Link to="/health/check" className={'btn btn-block ' + (latest && !data.inProgress ? 'btn-ghost' : 'btn-primary')}>
            {startLabel}
          </Link>
        )}
        {data && !canAnswer && !latest && <p className="muted">Ask the business owner to take the health check.</p>}
      </main>
      <BottomNav />
    </>
  );
}
