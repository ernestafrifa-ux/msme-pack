import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: !!getToken(), user: null, businesses: [] });

  const logout = useCallback(() => {
    setToken(null);
    setState({ loading: false, user: null, businesses: [] });
  }, []);

  const load = useCallback(() => {
    if (!getToken()) return;
    setState((s) => ({ ...s, loading: true, connectError: null }));
    api('/auth/me')
      .then((d) => setState({ loading: false, user: d.user, businesses: d.businesses }))
      .catch((err) => {
        // Keep the saved login when we simply can't reach the server.
        if (err.status === 401) logout();
        else setState((s) => ({ ...s, loading: false, connectError: err.message }));
      });
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    load();
  }, [logout, load]);

  const value = useMemo(
    () => ({
      ...state,
      business: state.businesses[0] || null,
      signIn(data) {
        setToken(data.token);
        setState({ loading: false, user: data.user, businesses: data.businesses || [] });
      },
      updateUser(u) {
        setState((s) => ({ ...s, user: u }));
      },
      addBusiness(b) {
        setState((s) => ({ ...s, businesses: [...s.businesses, b] }));
      },
      updateBusiness(b) {
        setState((s) => ({ ...s, businesses: s.businesses.map((x) => (x.id === b.id ? { ...x, ...b } : x)) }));
      },
      logout,
      retry: load,
    }),
    [state, logout, load]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
