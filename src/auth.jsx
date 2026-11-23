import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  adminApi, clearSession, getRefreshToken, getToken, refreshSession, REFRESH_EARLY_SECONDS, setRefreshedHandler,
  setSession, setUnauthorizedHandler, tokenExpiry,
} from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState(() => getToken());   // only to re-arm the refresh timer

  // Ends the session in this browser. The trusted-device token stays, so the next sign-in here skips the code.
  const clear = useCallback(() => { clearSession(); setAdmin(null); setTokenState(null); }, []);
  useEffect(() => { setUnauthorizedHandler(clear); }, [clear]);
  useEffect(() => { setRefreshedHandler((r) => { setTokenState(r.token); if (r.admin) setAdmin(r.admin); }); }, []);

  useEffect(() => {
    // Remember me: a refresh token alone (the admin token expired while the browser was closed) is enough.
    if (!getToken() && !getRefreshToken()) { setReady(true); return; }
    adminApi.me().then((r) => setAdmin(r.admin)).catch(clear).finally(() => setReady(true));
  }, [clear]);

  // Remember me: renew the admin token shortly before it expires, even while the panel sits idle.
  useEffect(() => {
    if (!admin || !token || !getRefreshToken()) return undefined;
    const exp = tokenExpiry(token);
    if (exp === null) return undefined;
    const wait = Math.min(2 ** 31 - 1, Math.max(0, exp * 1000 - Date.now() - REFRESH_EARLY_SECONDS * 1000));
    const t = setTimeout(() => { refreshSession().then((next) => { if (!next && !getToken()) clear(); }); }, wait);
    return () => clearTimeout(t);
  }, [admin, token, clear]);

  const value = useMemo(() => ({
    admin, ready,
    // remember: true keeps token + refreshToken in localStorage (30 days, rolling); false → this browser session only.
    signIn: (t, a, { refreshToken = null, remember = false } = {}) => { setSession({ token: t, refreshToken, remember }); setTokenState(t); setAdmin(a); },
    signOut: async () => { try { await adminApi.logout(); } catch { /* already expired */ } clear(); },
    isFull: admin?.role === 'full_admin',
  }), [admin, ready, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
