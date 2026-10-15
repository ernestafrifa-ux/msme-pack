import { useId } from 'react';
import { NavLink } from 'react-router-dom';

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
    logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end><Icon name="home" />Home</NavLink>
      <NavLink to="/record/sale" className="nav-record"><Icon name="plus" />Record</NavLink>
      <NavLink to="/records"><Icon name="list" />Records</NavLink>
    </nav>
  );
}
