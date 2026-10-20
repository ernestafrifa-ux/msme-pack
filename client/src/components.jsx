import { useId, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useT } from './i18n.jsx';

// Label + input + error message, wired up for screen readers.
export function Field({ label, error, hint, children, id: givenId }) {
  const autoId = useId();
  const id = givenId || autoId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const control = typeof children === 'function'
    ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error })
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <div id={`${id}-hint`} className="hint">{hint}</div>}
      {control}
      {error && <div id={`${id}-err`} className="field-error">{error}</div>}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <div className="form-error" role="alert">{message}</div>;
}

export function Icon({ name, size = 22 }) {
  const paths = {
    home: <path d="M3 11l9-7 9 7v9H3z" />,
    list: <path d="M4 6h16M4 12h16M4 18h10" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
    back: <path d="M15 18l-6-6 6-6" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    logout: <path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
    file: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    check: <path d="M5 12l5 5 9-10" />,
    play: <path d="M7 4l13 8-13 8z" />,
    book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 21V5" /></>,
    bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>,
    pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    alert: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
    share: <path d="M21 12a8.5 8.5 0 01-12.6 7.5L3 21l1.6-5.2A8.5 8.5 0 1121 12z" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></>,
    print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function BottomNav() {
  const { t } = useT();
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      <NavLink to="/" end><Icon name="home" />{t('nav.home')}</NavLink>
      <NavLink to="/records"><Icon name="list" />{t('nav.records')}</NavLink>
      <NavLink to="/record/sale" className="nav-record"><Icon name="plus" />{t('nav.record')}</NavLink>
      <NavLink to="/stock"><Icon name="box" />{t('nav.stock')}</NavLink>
      <NavLink to="/invoices"><Icon name="file" />{t('nav.invoices')}</NavLink>
      <NavLink to="/learn"><Icon name="book" />{t('nav.learn')}</NavLink>
    </nav>
  );
}

export function TopBar({ title, back = '/', right }) {
  const { t } = useT();
  return (
    <header className="topbar">
      <Link to={back} className="icon-btn" aria-label={t('common.back')}><Icon name="back" /></Link>
      <span className="topbar-title">{title}</span>
      {right || <span className="icon-btn" aria-hidden="true" />}
    </header>
  );
}

export function StatusPill({ status, label }) {
  return <span className={`pill pill-${status}`}>{label}</span>;
}

// A choice from a long list (customers, products, ingredients): looks like a dropdown, and
// opens a list you can search by typing a few letters. options: [{ value, label, hint? }].
// `emptyLabel` adds a first choice with value '' (e.g. "A new customer…").
export function SearchSelect({ value, options, onChange, placeholder, emptyLabel, label, id, ...aria }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = options.find((o) => o.value === value);
  const words = q.trim().toLowerCase();
  const list = options.filter((o) => !words || `${o.label} ${o.hint || ''}`.toLowerCase().includes(words));
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); };
  const shown = chosen ? chosen.label : value === '' && emptyLabel ? emptyLabel : placeholder;
  return (
    <div className="search-select">
      <button type="button" id={id} className={'select-btn' + (chosen ? '' : ' select-btn-empty')}
        aria-haspopup="dialog" aria-expanded={open} aria-label={label} {...aria} onClick={() => setOpen(!open)}>
        <span className="select-btn-text">{shown}{chosen?.hint ? <span className="muted small"> · {chosen.hint}</span> : null}</span>
        <Icon name="search" size={18} />
      </button>
      {open && (
        <div className="picker" role="dialog" aria-label={label || placeholder || emptyLabel}>
          <div className="picker-head">
            <label className="search">
              <Icon name="search" size={20} />
              <span className="sr-only">{t('picker.searchList')}</span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.searchList')} />
            </label>
            <button type="button" className="btn-link" onClick={() => { setOpen(false); setQ(''); }}>{t('common.close')}</button>
          </div>
          <ul className="picker-list">
            {emptyLabel && !words && (
              <li><button type="button" onClick={() => pick('')}><span className="picker-name">{emptyLabel}</span></button></li>
            )}
            {list.map((o) => (
              <li key={o.value}>
                <button type="button" aria-pressed={o.value === value} onClick={() => pick(o.value)}>
                  <span className="picker-name">{o.label}</span>
                  {o.hint && <span className="muted small">{o.hint}</span>}
                </button>
              </li>
            ))}
            {!list.length && <li className="muted small picker-empty">{t('picker.noMatch')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// Searchable list of products to add to a sale, stock purchase or invoice.
export function ProductPicker({ products, onPick, onClose, priceField = 'sellingPrice', showStock = true }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const list = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="picker" role="dialog" aria-label={t('picker.label')}>
      <div className="picker-head">
        <label className="search">
          <Icon name="search" size={20} />
          <span className="sr-only">{t('picker.search')}</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.search')} />
        </label>
        <button type="button" className="btn-link" onClick={onClose}>{t('picker.done')}</button>
      </div>
      <ul className="picker-list">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onPick(p)}>
              <span className="picker-name">{p.name}</span>
              <span className="muted small">
                GHS {p[priceField]}{showStock && p.trackStock ? ` · ${t('picker.inStock', { qty: Number(p.onHand), unit: p.unit })}` : ''}
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted small picker-empty">{t('picker.none')}</li>}
      </ul>
    </div>
  );
}
