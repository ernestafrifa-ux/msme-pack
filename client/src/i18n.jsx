import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useSession } from './session.jsx';
import en from './i18n/en.js';
import tw from './i18n/tw.js';
import twPhrases from './i18n/phrases.tw.js';

// Interface languages that have a word list. Other languages chosen at
// sign-up still get guides in that language when they exist, with the
// interface in English.
const DICTS = { en, tw };
const PHRASES = { tw: twPhrases };
// Translations still waiting for a fluent speaker's review.
export const DRAFT_LANGUAGES = []; // Twi was reviewed and approved in October 2026.
// Languages offered in the switcher (interface translated).
export const UI_LANGUAGES = ['en', 'tw'];

const STORE_KEY = 'msme.lang';
const I18nContext = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function I18nProvider({ children }) {
  const { user, updateUser } = useSession();
  // Before login the choice lives on the phone; after login it's saved to the account.
  const [guestLang, setGuestLang] = useState(() => readStored() || 'en');
  const lang = user?.preferredLanguage || guestLang;
  const dict = DICTS[lang] || en;

  useEffect(() => {
    document.documentElement.lang = DICTS[lang] ? lang : 'en';
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      let s = dict[key] ?? en[key];
      if (s === undefined) {
        if (import.meta.env.DEV) console.warn(`Missing text for "${key}"`);
        return key;
      }
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
      return s;
    },
    [dict]
  );

  const setLanguage = useCallback(
    async (code) => {
      try {
        localStorage.setItem(STORE_KEY, code);
      } catch {
        /* storage blocked */
      }
      setGuestLang(code);
      if (user) {
        // Switch at once (slow connections), then save; put it back if saving fails.
        const previous = user;
        updateUser({ ...user, preferredLanguage: code });
        try {
          const { user: updated } = await api('/auth/me', { method: 'PATCH', body: { preferredLanguage: code } });
          updateUser(updated);
        } catch (err) {
          updateUser(previous);
          throw err;
        }
      }
    },
    [user, updateUser]
  );

  // Newer screens: the English text itself is the key; phrases.tw.js gives the Twi.
  const phrases = PHRASES[lang];
  const tt = useCallback(
    (text, vars) => {
      let s = (phrases && phrases[text]) || text;
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
      return s;
    },
    [phrases]
  );

  const value = useMemo(
    () => ({ lang, t, tt, setLanguage, isDraft: DRAFT_LANGUAGES.includes(lang), hasUi: !!DICTS[lang] }),
    [lang, t, tt, setLanguage]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

// Shown on main screens while the interface translation is still a draft.
export function DraftLanguageBanner() {
  const { t, isDraft } = useT();
  if (!isDraft) return null;
  return (
    <p className="draft-banner" role="note">
      <span className="draft-tag">Draft</span> {t('lang.draftBanner')}
    </p>
  );
}
