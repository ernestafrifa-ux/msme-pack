import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { FormError, Icon } from '../components.jsx';
import { useT } from '../i18n.jsx';

// One question per screen. Each answer is saved straight away, so
// a dropped connection or a closed app loses nothing.
export default function HealthCheck() {
  const { business } = useSession();
  const { t } = useT();
  const navigate = useNavigate();
  const [check, setCheck] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const headingRef = useRef(null);
  const base = `/businesses/${business.id}/health`;

  useEffect(() => {
    api(base, { method: 'POST' })
      .then((d) => {
        setCheck(d);
        setAnswers(d.answers);
        // Carry on from the first unanswered question.
        const firstOpen = d.questions.findIndex((q) => !d.answers[q.id]);
        setIndex(firstOpen === -1 ? d.questions.length - 1 : firstOpen);
      })
      .catch((err) => setMessage(err.message));
  }, [base]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  if (!check) {
    return (
      <main className="screen">
        <FormError message={message} />
        {!message && <p role="status">{t('hc.loading')}</p>}
      </main>
    );
  }

  const q = check.questions[index];
  const total = check.questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLast = index === total - 1;
  const chosen = answers[q.id];

  async function choose(optionId) {
    setMessage('');
    setAnswers((a) => ({ ...a, [q.id]: optionId }));
    try {
      await api(`${base}/${check.id}/answers`, { method: 'PUT', body: { questionId: q.id, optionId } });
    } catch (err) {
      setAnswers((a) => {
        const next = { ...a };
        delete next[q.id];
        return next;
      });
      setMessage(err.message);
    }
  }

  async function finish() {
    setBusy(true);
    setMessage('');
    try {
      await api(`${base}/${check.id}/complete`, { method: 'POST' });
      navigate('/health', { replace: true, state: { justFinished: true } });
    } catch (err) {
      setMessage(err.message);
      const firstOpen = check.questions.findIndex((x) => !answers[x.id]);
      if (firstOpen !== -1) setIndex(firstOpen);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen hc">
      <header className="topbar">
        <Link to="/health" className="icon-btn" aria-label={t('hc.closeSaved')}><Icon name="close" /></Link>
        <span className="topbar-title">{t('hc.question', { n: index + 1, total })}</span>
        <span className="icon-btn" aria-hidden="true" />
      </header>
      <div className="bar progress" role="progressbar" aria-label={t('hc.answered')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount}>
        <div style={{ width: `${(answeredCount / total) * 100}%` }} />
      </div>

      <div className="area-chip">{t(`area.${q.areaCode}`)}</div>
      {t('hc.englishNote') && <p className="muted small">{t('hc.englishNote')}</p>}
      <h1 ref={headingRef} tabIndex={-1} className="hc-question">{q.prompt}</h1>
      {q.help && <p className="muted">{q.help}</p>}
      <FormError message={message} />

      <fieldset className="hc-options">
        <legend className="sr-only">{t('hc.chooseOne')}</legend>
        {q.options.map((o) => (
          <label key={o.id} className={'option hc-option' + (chosen === o.id ? ' option-on' : '')}>
            <input type="radio" name={`q-${q.id}`} value={o.id} checked={chosen === o.id} onChange={() => choose(o.id)} />
            {o.label}
          </label>
        ))}
      </fieldset>

      <div className="grid-2 hc-nav">
        <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>{t('common.back')}</button>
        {isLast ? (
          <button className="btn btn-primary" disabled={busy || !chosen} onClick={finish}>{busy ? t('hc.finishing') : t('hc.finish')}</button>
        ) : (
          <button className="btn btn-primary" disabled={!chosen} onClick={() => setIndex(index + 1)}>{t('hc.next')}</button>
        )}
      </div>
    </main>
  );
}
