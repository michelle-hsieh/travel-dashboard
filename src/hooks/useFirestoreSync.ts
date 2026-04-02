import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, QuerySnapshot, DocumentData, FirestoreError } from 'firebase/firestore';
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
  collaboratorEmails?: string[];
  memberEmails?: string[];
}

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').toLowerCase().trim();

export function useFirestoreTrips(userEmail: string | null | undefined) {
  const [trips, setTrips] = useState<FirestoreTripInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 所有人都可以看到所有旅程列表
    const q = query(collection(firestore, 'trips'));

    const unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const results = snap.docs.map(d => {
        const data = d.data();
        return {
          firestoreId: d.id,
          name: data.name,
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          adminEmail: data.adminEmail || '',
          adminUid: data.adminUid || '',
          collaboratorEmails: data.collaboratorEmails || [],
          memberEmails: data.memberEmails || [],
        };
      });

      setTrips(results.sort((a, b) => b.startDate.localeCompare(a.startDate)));
      setLoading(false);
    }, (err: FirestoreError) => {
      console.error("Firestore Query Error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return { trips, loading };
}
