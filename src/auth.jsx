import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { adminApi, getToken, setToken, setUnauthorizedHandler } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(() => { setToken(null); setAdmin(null); }, []);
  useEffect(() => { setUnauthorizedHandler(clear); }, [clear]);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    adminApi.me().then((r) => setAdmin(r.admin)).catch(clear).finally(() => setReady(true));
  }, [clear]);

  const value = useMemo(() => ({
    admin, ready,
    signIn: (token, a) => { setToken(token); setAdmin(a); },
    signOut: async () => { try { await adminApi.logout(); } catch { /* already expired */ } clear(); },
    isFull: admin?.role === 'full_admin',
  }), [admin, ready, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
