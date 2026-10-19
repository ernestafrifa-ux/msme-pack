import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';

// Logged in, but not (or no longer) part of a business; or the owner is still setting it up.
export default function NoBusiness({ waiting = false }) {
  const { tt } = useT();
  const { user, business, logout, retry } = useSession();
  return (
    <main className="screen auth">
      <div className="brand-mark" aria-hidden="true" />
      <h1>{waiting ? business.name : tt('Hello {value}', { value: user.fullName.split(' ')[0] })}</h1>
      <p className="lead">
        {waiting
          ? tt('The owner is still setting up this business. Try again once they have entered where the money is kept.')
          : tt('You are not part of any business yet. A business owner adds their staff, and the MSME Pack team sets up new businesses. Ask them to add your phone number.')}
      </p>
      <div className="stack">
        <button type="button" className="btn btn-primary btn-block" onClick={retry}>{tt('Try again')}</button>
        <button type="button" className="btn btn-ghost btn-block" onClick={logout}>{tt('Log out')}</button>
      </div>
    </main>
  );
}
