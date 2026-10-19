import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReceiptPaper from '../ReceiptPaper.jsx';

// What the customer opens from the WhatsApp link. No login needed.
export default function PublicReceipt() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/receipts/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This receipt link is not valid, or the sale was removed.' : 'Could not load the receipt. Please try again.');
        return r.json();
      })
      .then((d) => { setData(d); document.title = `Receipt ${d.receipt.number} · ${d.business.name}`; })
      .catch((err) => setError(err.message === 'Failed to fetch' ? 'No connection. Please try again.' : err.message));
  }, [token]);

  if (error) return <div className="center-screen"><p>{error}</p></div>;
  if (!data) return <div className="center-screen" role="status">Loading receipt…</div>;
  return (
    <main className="public-invoice">
      <ReceiptPaper business={data.business} receipt={data.receipt} />
      <div className="no-print public-actions">
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
        <p className="muted small">Made with MSME Pack</p>
      </div>
    </main>
  );
}
