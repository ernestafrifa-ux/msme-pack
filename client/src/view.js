// Phone view or computer view. The choice is kept on this device only (each phone or
// computer can have its own). "Automatic" uses the computer view on a wide screen.
import { useEffect, useState } from 'react';

const KEY = 'msme.view';
const WIDE = '(min-width: 1024px)';
const EVENT = 'msme-view';

export function getViewChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'desktop' || v === 'phone' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function isDesktop() {
  const choice = getViewChoice();
  if (choice !== 'auto') return choice === 'desktop';
  return typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;
}

export function applyView() {
  document.documentElement.classList.toggle('desk', isDesktop());
  window.dispatchEvent(new Event(EVENT));
}

export function setViewChoice(choice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* storage blocked: the choice lasts until the page is reloaded */ }
  if (choice === 'auto') applyView();
  else { document.documentElement.classList.toggle('desk', choice === 'desktop'); window.dispatchEvent(new Event(EVENT)); }
}

// Call once at start: sets the view now and follows the window when it is resized.
export function startView() {
  applyView();
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(WIDE).addEventListener?.('change', applyView);
  }
}

export function useDesktop() {
  const [desk, setDesk] = useState(() => document.documentElement.classList.contains('desk'));
  useEffect(() => {
    const on = () => setDesk(document.documentElement.classList.contains('desk'));
    window.addEventListener(EVENT, on);
    on();
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return desk;
}

export function useViewChoice() {
  const [choice, setChoice] = useState(getViewChoice);
  useEffect(() => {
    const on = () => setChoice(getViewChoice());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [choice, setViewChoice];
}
