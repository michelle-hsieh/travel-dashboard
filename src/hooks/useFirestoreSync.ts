import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QuerySnapshot, DocumentData, FirestoreError } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface FirestoreTripInfo {
  firestoreId: string;
  name: string;
  startDate: string;
  endDate: string;
  adminEmail: string;
  adminUid: string;
  collaboratorEmails?: string[];
  memberEmails?: string[];
  publicPermissions?: any; // ✅ 恢復
}

export function useFirestoreTrips(userEmail: string | null | undefined) {
  const [trips, setTrips] = useState<FirestoreTripInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);

    const q = query(collection(firestore, 'trips'));

    const unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const results = snap.docs.map(d => {
        const data = d.data();
        return {
          firestoreId: d.id,
          name: data.name || '未命名旅程',
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          adminEmail: data.adminEmail || '',
          adminUid: data.adminUid || '',
          collaboratorEmails: data.collaboratorEmails || [],
          memberEmails: data.memberEmails || [],
          publicPermissions: data.publicPermissions || null, // ✅ 恢復
        };
      });

      setTrips(results.sort((a, b) => b.startDate.localeCompare(a.startDate)));
      setLoading(false);
    }, (err: FirestoreError) => {
      console.error("Firestore Trips Query Error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return { trips, loading };
}
