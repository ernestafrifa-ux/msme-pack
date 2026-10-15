import { useT, UI_LANGUAGES } from './i18n.jsx';

// Small English | Twi switch for the screens before login.
export default function LanguageSwitch() {
  const { lang, t, setLanguage } = useT();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {UI_LANGUAGES.map((code) => (
        <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLanguage(code)}>
          {t(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}
