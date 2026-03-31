import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, DocumentData } from 'firebase/firestore';
import { firestore } from '../firebase';

/**
 * 這是為了完美取代 dexie-react-hooks 的 useLiveQuery 所設計的泛用 Hook。
 * 它會監聽 Firestore 上的子集合 (Subcollection)，並自動將 doc.id 轉為字串 ID 回傳。
 */
export function useFirestoreQuery<T>(
    tripId: string | null | undefined, // 必須傳入 Firestore 的字串 ID
    collectionName: string, // 例如 'days', 'places', 'flights'
    sortByField: string = 'sortOrder'
): (T & { id: string })[] | undefined {
    const [data, setData] = useState<(T & { id: string })[] | undefined>(undefined);

    useEffect(() => {
        // 如果沒有選中 tripId，直接回傳 undefined (與 dexie 行為一致)
        if (!tripId) {
            setData(undefined);
            return;
        }

        // 建立查詢路徑： /trips/{tripId}/{collectionName}
        const subRef = collection(firestore, 'trips', tripId, collectionName);

        // 大多數資料都需要照順序排列
        const q = query(subRef, orderBy(sortByField));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const results = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...(doc.data() as T)
                }));
                setData(results);
            },
            (error) => {
                console.error(`Error fetching ${collectionName}:`, error);
                // 如果因為權限不足 (Rules) 擋下，就給空陣列，避免白畫面
                setData([]);
            }
        );

        return () => unsubscribe();
    }, [tripId, collectionName, sortByField]);

    return data;
}