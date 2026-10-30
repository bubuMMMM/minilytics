import { useEffect, useState } from 'react';
import { api } from './api';

export type Role = 'owner' | 'admin' | 'viewer';
export interface Me { loggedIn: boolean; role?: Role; email?: string | null; name?: string | null; sites?: '*' | string[] }
export const ROLE_LABEL: Record<Role, string> = { owner: 'Propriétaire', admin: 'Admin', viewer: 'Lecteur' };

let current: Me | null = null;
let pending: Promise<Me> | null = null;
const subs = new Set<(m: Me) => void>();

export function loadMe(force = false): Promise<Me> {
  if (current && !force) return Promise.resolve(current);
  if (!pending || force) {
    pending = api<Me>('/api/auth/me').then(
      (m) => { current = m; pending = null; subs.forEach((f) => f(m)); return m; },
      () => { pending = null; return { loggedIn: false }; },
    );
  }
  return pending;
}

/** The signed-in person and their role (owner / admin / viewer). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(current);
  useEffect(() => {
    subs.add(setMe);
    loadMe().then(setMe);
    return () => { subs.delete(setMe); };
  }, []);
  return me;
}
