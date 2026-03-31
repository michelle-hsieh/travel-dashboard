import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, type Unsubscribe } from 'firebase/firestore';
import { firestore } from '../firebase';
import { pushTripToCloud, refreshTripFromCloud } from '../db/sync';
import type { Role } from '../types';
import type { User } from 'firebase/auth';
import { normalizeEmail } from '../utils/emails';


/**
 * Auto-sync hook:
 * - Admin: uploads local Dexie data to Firestore on trip select + periodically
 * - Member: subscribes to Firestore changes and downloads to local Dexie
 */
export function useFirestoreSync(
  tripId: number | null,
  firestoreTripId: string | null,
  role: Role,
  user: User | null,
  setActiveFirestoreTripId: (id: string | null) => void
) {
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const uploadInFlightRef = useRef(false);

  const doUpload = useCallback(async () => {
    if (!tripId || !user || role !== 'admin' || uploadInFlightRef.current) return;
    try {
      uploadInFlightRef.current = true;
      const nextFirestoreTripId = await pushTripToCloud(tripId, user.uid, user.email ?? '');
      if (nextFirestoreTripId && nextFirestoreTripId !== firestoreTripId) {
        setActiveFirestoreTripId(nextFirestoreTripId);
      }
    } catch (err) {
      console.warn('Firestore upload failed (offline?):', err);
    } finally {
      uploadInFlightRef.current = false;
    }
  }, [tripId, firestoreTripId, user, role, setActiveFirestoreTripId]);

  useEffect(() => {
    // Cleanup previous listeners
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (uploadTimerRef.current) {
      clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }

    if (!tripId || !user) return;

    if (role === 'admin') {
      // Admin: upload immediately + every 10s
      doUpload();
      uploadTimerRef.current = setInterval(doUpload, 10_000);

      // Also upload on visibility change (user comes back to tab)
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') doUpload();
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    if (role === 'member' && firestoreTripId) {
      // Member: subscribe to the shared trip metadata document, then refresh
      // the permitted subcollections via the unified sync.ts path.
      unsubRef.current = onSnapshot(
        doc(firestore, 'trips', firestoreTripId),
        async (snap) => {
          if (!snap.exists() || !tripId) return;
          await refreshTripFromCloud(tripId, firestoreTripId, user.email ?? undefined, false);
        },
        (error) => {
          console.error('Firestore trip subscription error:', error);
        }
      );

      return () => {
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
      };
    }
  }, [tripId, firestoreTripId, user, role, doUpload]);
}

/**
 * Hook to list trips from Firestore that the current user has access to.
 * Returns shared trips where the user is a collaborator.
 */
export interface FirestoreTripInfo {
  firestoreId: string;
  name: string;
  startDate: string;
  endDate: string;
  adminEmail: string;
}

export function useFirestoreTrips(userEmail: string | null | undefined) {
  const [trips, setTrips] = useState<FirestoreTripInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      setTrips([]);
      return;
    }

    setLoading(true);
    const email = normalizeEmail(userEmail);

    // Query trips where this user is a collaborator (both legacy and current arrays)
    const q1 = query(
      collection(firestore, 'trips'),
      where('collaboratorEmails', 'array-contains', email)
    );
    const q2 = query(
      collection(firestore, 'trips'),
      where('memberEmails', 'array-contains', email)
    );

    const results: Map<string, FirestoreTripInfo> = new Map();

    const handleSnap = (snap: any) => {
      snap.forEach((d: any) => {
        const data = d.data() as FirestoreTripInfo;
        results.set(d.id, {
          firestoreId: d.id,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          adminEmail: data.adminEmail,
        });
      });
      setTrips(Array.from(results.values()));
      setLoading(false);
    };

    const unsub1 = onSnapshot(q1, handleSnap, (err) => {
      console.error('Failed to query collaboratorEmails trips:', err);
      setLoading(false);
    });
    const unsub2 = onSnapshot(q2, handleSnap, (err) => {
      console.error('Failed to query memberEmails trips:', err);
      setLoading(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [userEmail]);

  return { trips, loading };
}
