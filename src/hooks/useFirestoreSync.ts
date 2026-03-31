import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { normalizeEmail } from '../utils/emails';

export interface FirestoreTripInfo {
  firestoreId: string;
  name: string;
  startDate: string;
  endDate: string;
  adminEmail: string;
  adminUid: string;
}

export function useFirestoreTrips(userEmail: string | null | undefined) {
  const [trips, setTrips] = useState<FirestoreTripInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!userEmail || !user) {
      setTrips([]);
      return;
    }

    setLoading(true);
    const email = normalizeEmail(userEmail);

    const q1 = query(collection(firestore, 'trips'), where('collaboratorEmails', 'array-contains', email));
    const q2 = query(collection(firestore, 'trips'), where('memberEmails', 'array-contains', email));
    const qAdmin = query(collection(firestore, 'trips'), where('adminUid', '==', user.uid));

    const results: Map<string, FirestoreTripInfo> = new Map();

    const handleSnap = (snap: any) => {
      snap.forEach((d: any) => {
        const data = d.data();
        results.set(d.id, {
          firestoreId: d.id,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          adminEmail: data.adminEmail,
          adminUid: data.adminUid,
        });
      });
      setTrips(Array.from(results.values()));
      setLoading(false);
    };

    const unsub1 = onSnapshot(q1, handleSnap);
    const unsub2 = onSnapshot(q2, handleSnap);
    const unsubAdmin = onSnapshot(qAdmin, handleSnap);

    return () => {
      unsub1();
      unsub2();
      unsubAdmin();
    };
  }, [userEmail, user]);

  return { trips, loading };
}