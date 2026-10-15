import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Icon, TopBar } from '../components.jsx';
import { Markdown } from '../markdown.jsx';
import { longDate } from '../format';

export default function Guide() {
  const { slug } = useParams();
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGuide(null);
    api(`/guides/${slug}`).then((d) => setGuide(d.guide)).catch((err) => setError(err.message));
  }, [slug]);

  async function toggleDone() {
    setBusy(true);
    try {
      const done = guide.progress !== 'completed';
      const d = await api(`/guides/${slug}/complete`, { method: 'POST', body: { done } });
      setGuide({ ...guide, progress: d.progress });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const done = guide?.progress === 'completed';
  return (
    <main className="screen guide">
      <TopBar title="Guide" back="/learn" />
      {error && <div className="form-error" role="alert">{error}</div>}
      {!guide && !error && <p role="status">Loading…</p>}
      {guide && (
        <article>
          <div className="muted small">{guide.areaName} · {guide.readMinutes} min read</div>
          <h1>{guide.title}</h1>
          <p className="lead">{guide.summary}</p>
          {guide.audioUrl && (
            <audio className="guide-audio" controls preload="none" src={guide.audioUrl}>
              Your browser can't play this audio.
            </audio>
          )}
          <Markdown source={guide.body} />

          {guide.toolPath && (
            <div className="card try-it">
              <div className="txn-title">Try it now</div>
              <Link to={guide.toolPath} className="btn btn-primary btn-block">{guide.toolLabel || 'Open'}</Link>
            </div>
          )}

          <button className={'btn btn-block ' + (done ? 'btn-ghost' : 'btn-primary')} onClick={toggleDone} disabled={busy} aria-pressed={done}>
            <Icon name={done ? 'check' : 'plus'} size={18} /> {done ? 'Read. Tap to undo' : 'Mark as read'}
          </button>
          {guide.reviewedAt && (
            <p className="muted small center">Checked for accuracy {longDate(guide.reviewedAt.slice(0, 10))}. Rules change: confirm with the office concerned.</p>
          )}
        </article>
      )}
    </main>
  );
}
