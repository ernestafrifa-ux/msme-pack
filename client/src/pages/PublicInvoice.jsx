import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import InvoicePaper from '../InvoicePaper.jsx';

// What the customer opens from the WhatsApp link. No login needed.
export default function PublicInvoice() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/invoices/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This invoice link is not valid, or the invoice was removed.' : 'Could not load the invoice. Please try again.');
        return r.json();
      })
      .then((d) => {
        setData(d);
        document.title = `Invoice ${d.invoice.number} · ${d.business.name}`;
      })
      .catch((err) => setError(err.message === 'Failed to fetch' ? 'No connection. Please try again.' : err.message));
  }, [token]);

  if (error) return <div className="center-screen"><p>{error}</p></div>;
  if (!data) return <div className="center-screen" role="status">Loading invoice…</div>;

  return (
    <main className="public-invoice">
      <InvoicePaper business={data.business} invoice={data.invoice} customer={data.invoice.customer} />
      <div className="no-print public-actions">
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
        <p className="muted small">Made with MSME Pack</p>
      </div>
    </main>
  );
}
