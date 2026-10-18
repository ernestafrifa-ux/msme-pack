import { useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session.jsx';

// Loads a statement from /businesses/:id/reports/<name> whenever the params change.
export function useReport(name, params) {
  const { business } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  useEffect(() => {
    let live = true;
    setError('');
    api(`/businesses/${business.id}/reports/${name}${qs ? `?${qs}` : ''}`)
      .then((d) => live && setData(d))
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [business.id, name, qs]);
  return { data, error };
}
