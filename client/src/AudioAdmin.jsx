import { useEffect, useRef, useState } from 'react';
import { api, getToken } from './api';
import { useT } from './i18n.jsx';
import { Icon } from './components.jsx';

const LANGUAGES = ['tw', 'en', 'ee', 'gaa', 'dag', 'ha'];

// Pick a recording format the phone's browser supports (Chrome/Android: WebM, iPhone: MP4).
function recorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// For content admins: add, replace, approve or remove a guide's recording in each language.
export default function AudioAdmin({ slug, audio, onChange }) {
  const { t } = useT();
  const [lang, setLang] = useState('tw');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState(null); // { blob, url } waiting to be kept or discarded
  const recorder = useRef(null);
  const timer = useRef(null);
  const current = audio.find((a) => a.language === lang);
  const canRecord = recorderType() !== null && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream?.getTracks().forEach((tr) => tr.stop());
  }, []);

  useEffect(() => () => take && URL.revokeObjectURL(take.url), [take]);

  async function upload(blob) {
    setBusy(true);
    setError('');
    setMessage(t('audio.uploading'));
    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(slug)}/audio?lang=${lang}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setMessage(t('audio.uploaded'));
      setTake(null);
      onChange();
    } catch (err) {
      setMessage('');
      setError(err.message === 'Failed to fetch' ? 'No connection. Try again.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError('');
    setMessage('');
    setTake(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = recorderType();
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
        setTake({ blob, url: URL.createObjectURL(blob) });
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(t('audio.micDenied'));
    }
  }

  function stopRecording() {
    clearInterval(timer.current);
    recorder.current?.stop();
    setRecording(false);
  }

  async function act(method, body, okMessage) {
    setBusy(true);
    setError('');
    try {
      await api(`/guides/${encodeURIComponent(slug)}/audio/${lang}`, { method, body });
      setMessage(okMessage || '');
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card audio-admin" aria-label={t('audio.title')}>
      <h2>{t('audio.title')}</h2>
      <label className="field">
        <span className="field-label">{t('audio.language')}</span>
        <select value={lang} onChange={(e) => { setLang(e.target.value); setTake(null); setMessage(''); setError(''); }} disabled={recording}>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`lang.${code}`)}{audio.some((a) => a.language === code) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>

      {current ? (
        <div className="audio-current">
          <div className="small">
            {t('audio.current')}{current.isDraft && <> · <span className="draft-tag">{t('guide.draftAudio')}</span></>}
          </div>
          <audio controls preload="none" src={current.url} aria-label={t('audio.current')} />
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => act('PATCH', { isDraft: !current.isDraft })}>
              {current.isDraft ? t('audio.approve') : t('audio.unapprove')}
            </button>
            <button type="button" className="btn btn-ghost danger-text" disabled={busy}
              onClick={() => window.confirm(t('audio.confirmDelete', { lang: t(`lang.${lang}`) })) && act('DELETE')}>
              <Icon name="trash" size={18} /> {t('audio.delete')}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted small">{t('audio.none')}</p>
      )}

      <p className="muted small">{t('audio.tip')}</p>

      {take ? (
        <div className="audio-take">
          <div className="small">{t('audio.preview')}</div>
          <audio controls src={take.url} aria-label={t('audio.preview')} />
          <div className="grid-2">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setTake(null)}>{t('audio.discard')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => upload(take.blob)}>{t('audio.keep')}</button>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {canRecord && (recording ? (
            <button type="button" className="btn btn-primary rec-on" onClick={stopRecording}>
              <span className="rec-dot" aria-hidden="true" /> {t('audio.stop')} · {clock(seconds)}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={startRecording}>
              <span className="rec-dot" aria-hidden="true" /> {t('audio.record')}
            </button>
          ))}
          <label className={'btn btn-ghost file-btn' + (busy || recording ? ' disabled' : '')}>
            <Icon name="plus" size={18} /> {t('audio.upload')}
            <input type="file" accept="audio/*" disabled={busy || recording}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
          </label>
        </div>
      )}
      {recording && <p className="small" role="status">{t('audio.recording', { time: clock(seconds) })}</p>}
      {message && <p className="small flash" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
