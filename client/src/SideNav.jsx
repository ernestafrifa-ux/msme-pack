import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useT } from './i18n.jsx';
import { useSession } from './session.jsx';
import { Icon } from './components.jsx';
import BizLogo from './BizLogo.jsx';
import { setViewChoice } from './view.js';

// Computer view: the menu sits down the left side and stays on every screen.
export default function SideNav() {
  const { t, tt } = useT();
  const { user, business, logout } = useSession();
  useEffect(() => {
    document.documentElement.classList.add('has-side');
    return () => document.documentElement.classList.remove('has-side');
  }, []);
  return (
    <nav className="side-nav" aria-label={t('nav.main')}>
      <Link to="/" className="side-brand">
        <BizLogo business={business} size={40} />
        <span className="side-brand-name">{business.name}</span>
      </Link>
      <Link to="/record/sale" className="btn btn-primary side-record"><Icon name="plus" size={20} />{tt('Record a sale')}</Link>
      <NavLink to="/" end><Icon name="home" size={20} />{t('nav.home')}</NavLink>
      <NavLink to="/records"><Icon name="list" size={20} />{t('nav.records')}</NavLink>
      <NavLink to="/stock"><Icon name="box" size={20} />{t('nav.stock')}</NavLink>
      <NavLink to="/invoices"><Icon name="file" size={20} />{t('nav.invoices')}</NavLink>
      <NavLink to="/customers"><Icon name="users" size={20} />{tt('Customers')}</NavLink>
      <NavLink to="/reports"><Icon name="chart" size={20} />{tt('Reports')}</NavLink>
      <NavLink to="/health"><Icon name="pulse" size={20} />{t('health.title')}</NavLink>
      <NavLink to="/learn"><Icon name="book" size={20} />{t('nav.learn')}</NavLink>
      <NavLink to="/notices"><Icon name="bell" size={20} />{tt('Messages')}</NavLink>
      <NavLink to="/settings"><Icon name="settings" size={20} />{t('home.settings')}</NavLink>
      {user.isAdmin && <NavLink to="/admin" className="side-admin"><Icon name="shield" size={20} />{tt('MSME Pack admin')}</NavLink>}
      <div className="side-foot">
        <button type="button" className="side-link" onClick={() => setViewChoice('phone')}>
          <Icon name="phone" size={20} />{tt('Switch to phone view')}
        </button>
        <button type="button" className="side-link" onClick={() => { if (window.confirm(t('home.logoutConfirm'))) logout(); }}>
          <Icon name="logout" size={20} />{t('settings.logout')}
        </button>
      </div>
    </nav>
  );
}
