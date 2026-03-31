import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../firebase';
import { Role, TabPermissions, PermissionLevel, TripMeta } from '../types';
import { normalizeEmail, collaboratorKey } from '../utils/emails';

const DEFAULT_PERMISSIONS: TabPermissions = {
  planner: 'none',
  flights: 'none',
  hotels: 'none',
  tickets: 'none',
  resources: 'none',
};

const ADMIN_PERMISSIONS: TabPermissions = {
  planner: 'write',
  flights: 'write',
  hotels: 'write',
  tickets: 'write',
  resources: 'write',
};

interface AuthState {
  user: User | null;
  loading: boolean;
  role: Role;
  permissions: TabPermissions;
  tripMeta: TripMeta | null;
  activeTripId: string | null;
  setActiveTripId: (id: string | null) => void;
  canWrite: (tab: keyof TabPermissions) => boolean;
  canRead: (tab: keyof TabPermissions) => boolean;
}

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').toLowerCase().trim();


const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  role: 'guest',
  permissions: DEFAULT_PERMISSIONS,
  tripMeta: null,
  activeTripId: null,
  setActiveTripId: () => {},
  canWrite: () => false,
  canRead: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>('guest');
  const [permissions, setPermissions] = useState<TabPermissions>(DEFAULT_PERMISSIONS);
  const [tripMeta, setTripMeta] = useState<TripMeta | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const isWhitelistedAdmin = useCallback(
    (u: User | null): boolean => {
      if (!u || !ADMIN_EMAIL) return false;
      const email = u.email ? normalizeEmail(u.email) : '';
      return email === normalizeEmail(ADMIN_EMAIL);
    },
    []
  );

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        setRole('guest');
        setPermissions(DEFAULT_PERMISSIONS);
      }
    });
    return unsub;
  }, []);

  // Listen to trip metadata when activeTripId changes
  useEffect(() => {
    if (!activeTripId) {
      setTripMeta(null);
      if (isWhitelistedAdmin(user)) {
        setRole('admin');
        setPermissions(ADMIN_PERMISSIONS);
      } else {
        setRole('guest');
        setPermissions(DEFAULT_PERMISSIONS);
      }
      return;
    }

    const unsub = onSnapshot(
      doc(firestore, 'trips', activeTripId),
      (snap) => {
        if (!snap.exists()) {
          // Trip not in Firestore yet (local IndexedDB only)
          setTripMeta(null);
          if (isWhitelistedAdmin(user)) {
            setRole('admin');
            setPermissions(ADMIN_PERMISSIONS);
          } else {
            setRole('guest');
            setPermissions(DEFAULT_PERMISSIONS);
          }
          return;
        }
        const data = snap.data() as TripMeta;
        setTripMeta(data);

        if (!user) {
          setRole('guest');
          setPermissions(DEFAULT_PERMISSIONS);
          return;
        }

        const userEmailRaw = user.email?.toLowerCase().trim() ?? '';
        const userEmailNormalized = user.email ? normalizeEmail(user.email) : '';

        // Check if admin (must be the whitelisted root admin)
        const isTripAdmin =
          isWhitelistedAdmin(user) &&
          (user.uid === data.adminUid ||
            (data.adminEmail ? normalizeEmail(data.adminEmail) === userEmailNormalized : false) ||
            !data.adminUid);

        if (isTripAdmin) {
          setRole('admin');
          setPermissions(ADMIN_PERMISSIONS);
          return;
        }

        // Check if collaborator by normalized key
        const key = collaboratorKey(userEmailNormalized);
        const legacyKey = userEmailRaw.replace(/\./g, '_'); // backward compatibility for old data
        let collab = data.collaborators?.[key] ?? data.collaborators?.[legacyKey];
        if (!collab && data.collaborators) {
          collab = Object.values(data.collaborators).find((c: any) =>
            normalizeEmail((c as any).email) === userEmailNormalized
          ) as any;
        }
        if (collab) {
          setRole('member');
          setPermissions(collab.permissions);
        } else {
          setRole('guest');
          setPermissions(DEFAULT_PERMISSIONS);
        }
      },
      (error) => {
        console.error('Error listening to trip meta:', error);
        // Fallback: if Firestore is not set up yet, only whitelisted admin can continue as admin
        if (isWhitelistedAdmin(user)) {
          setRole('admin');
          setPermissions(ADMIN_PERMISSIONS);
        }
      }
    );

    return unsub;
  }, [activeTripId, user, isWhitelistedAdmin]);

  const canWrite = useCallback(
    (tab: keyof TabPermissions) => role === 'admin' || permissions[tab] === 'write',
    [role, permissions]
  );

  const canRead = useCallback(
    (tab: keyof TabPermissions): boolean =>
      role === 'admin' || permissions[tab] === 'read' || permissions[tab] === 'write',
    [role, permissions]
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, role, permissions, tripMeta, activeTripId, setActiveTripId, canWrite, canRead }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function hasPermission(level: PermissionLevel, required: PermissionLevel): boolean {
  if (required === 'none') return true;
  if (required === 'read') return level === 'read' || level === 'write';
  return level === 'write';
}
