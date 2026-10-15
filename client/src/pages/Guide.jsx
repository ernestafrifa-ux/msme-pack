import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Icon, TopBar } from '../components.jsx';
import { Markdown } from '../markdown.jsx';
import { longDate } from '../format';
import AudioAdmin from '../AudioAdmin.jsx';

export default function Guide() {
  const { slug } = useParams();
  const { user } = useSession();
  const { t, lang } = useT();
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const load = useCallback(() => {
    api(`/guides/${slug}`, { query: { original: 1 } }).then((d) => setGuide(d.guide)).catch((err) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    setGuide(null);
    setShowOriginal(false);
    load();
  }, [load, lang]);

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
  // Play the recording in the reader's language if there is one, otherwise the first available.
  const audio = guide?.audio?.find((a) => a.language === lang) || guide?.audio?.[0];
  const translated = guide && guide.language !== 'en';
  const wantedTranslation = lang !== 'en' && guide && !translated;

  return (
    <main className="screen guide">
      <TopBar title={t('guide.title')} back="/learn" />
      {error && <div className="form-error" role="alert">{error}</div>}
      {!guide && !error && <p role="status">{t('common.loading')}</p>}
      {guide && (
        <article lang={guide.language}>
          {guide.isDraft && (
            <aside className="draft-box" role="note">
              <strong><span className="draft-tag">Draft</span> {t('guide.draftTitle')}</strong>
              <span>{t('guide.draftBody')}</span>
            </aside>
          )}
          {wantedTranslation && <p className="muted small">{t('guide.notTranslated')}</p>}

          <div className="muted small">{t(`area.${guide.areaCode}`)} · {t('learn.minRead', { n: guide.readMinutes })}</div>
          <h1>{guide.title}</h1>
          <p className="lead">{guide.summary}</p>

          {audio && (
            <figure className="guide-audio-box">
              <figcaption>
                <Icon name="play" size={18} />{' '}
                {t('guide.listenIn', { lang: t(`lang.${audio.language}`).replace(/ \(.*\)$/, '') })}
                {audio.isDraft && <> · <span className="draft-tag">{t('guide.draftAudio')}</span></>}
              </figcaption>
              <audio className="guide-audio" controls preload="none" src={audio.url}>
                {t('guide.cantPlay')}
              </audio>
            </figure>
          )}

          <Markdown source={guide.body} />

          {translated && guide.original && (
            <div className="original">
              <button type="button" className="btn-link" aria-expanded={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
                {showOriginal ? t('guide.hideEnglish') : t('guide.showEnglish')}
              </button>
              {showOriginal && (
                <section className="card original-text" lang="en" aria-label={t('guide.englishOriginal')}>
                  <h2>{guide.original.title}</h2>
                  <Markdown source={guide.original.body} />
                </section>
              )}
            </div>
          )}

          {guide.toolPath && (
            <div className="card try-it">
              <div className="txn-title">{t('guide.try')}</div>
              <Link to={guide.toolPath} className="btn btn-primary btn-block">{guide.toolLabel || t('guide.open')}</Link>
            </div>
          )}

          <button className={'btn btn-block ' + (done ? 'btn-ghost' : 'btn-primary')} onClick={toggleDone} disabled={busy} aria-pressed={done}>
            <Icon name={done ? 'check' : 'plus'} size={18} /> {done ? t('guide.readUndo') : t('guide.markRead')}
          </button>
          {guide.reviewedAt && (
            <p className="muted small center">{t('guide.checked', { date: longDate(guide.reviewedAt.slice(0, 10), t) })}</p>
          )}

          {user.isAdmin && <AudioAdmin slug={slug} audio={guide.audio} onChange={load} />}
        </article>
      )}
    </main>
  );
}
