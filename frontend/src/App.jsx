import { useState, useEffect, useCallback } from "react";
import { getToken, setToken, api } from "./api.js";
import { LoginScreen, ChangePasswordGate } from "./auth-screens.jsx";
import { AppShell } from "./app-shell.jsx";
import { ThemeWrapper } from "./theme.jsx";

export default function App() {
  const [authState, setAuthState] = useState("checking"); // checking | loggedOut | mustChangePassword | ready
  const [session, setSession] = useState(null); // { user, role }

  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthState("loggedOut"); return; }
    api.me()
      .then(({ user, role }) => {
        if (user.mustChangePassword) { setAuthState("mustChangePassword"); setSession({ user, role }); }
        else { setSession({ user, role }); setAuthState("ready"); }
      })
      .catch(() => { setToken(null); setAuthState("loggedOut"); });
  }, []);

  const handleLoggedIn = useCallback((result) => {
    setSession({ user: result.user, role: result.role });
    setAuthState(result.mustChangePassword ? "mustChangePassword" : "ready");
  }, []);

  const handlePasswordChanged = useCallback(() => {
    setAuthState("ready");
  }, []);

  const handleSignOut = useCallback(() => {
    setToken(null);
    setSession(null);
    setAuthState("loggedOut");
  }, []);

  if (authState === "checking") {
    return <ThemeWrapper><div style={{ minHeight: "100vh" }} /></ThemeWrapper>;
  }
  if (authState === "loggedOut") {
    return <ThemeWrapper><LoginScreen onLoggedIn={handleLoggedIn} /></ThemeWrapper>;
  }
  if (authState === "mustChangePassword") {
    return <ThemeWrapper><ChangePasswordGate onChanged={handlePasswordChanged} /></ThemeWrapper>;
  }

  return <AppShell session={session} onSignOut={handleSignOut} />;
}
