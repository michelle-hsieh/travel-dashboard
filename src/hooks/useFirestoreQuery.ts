import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';

/**
 * 這是為了完美取代 dexie-react-hooks 的 useLiveQuery 所設計的泛用 Hook。
 * 它會監聽 Firestore 上的子集合 (Subcollection)，並自動將 doc.id 轉為字串 ID 回傳。
 *
 * **Important**: Firestore's orderBy silently excludes documents missing the sortByField.
 * To prevent data loss and avoid complex fallback logic, we query the subcollection
 * without ordering and perform the sorting locally.
 */
export function useFirestoreQuery<T>(
    tripId: string | null | undefined,
    collectionName: string,
    sortByField: string = 'sortOrder'
): (T & { id: string })[] | undefined {
    const [data, setData] = useState<(T & { id: string })[] | undefined>(undefined);

    useEffect(() => {
        if (!tripId) {
            setData(undefined);
            return;
        }

        const subRef = collection(firestore, 'trips', tripId, collectionName);
        const q = query(subRef);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const results = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...(doc.data() as T)
                }));

                // 本地執行排序，避免 Firestore 丟失缺少 sortByField 的文件
                results.sort((a: any, b: any) => {
                    const valA = a[sortByField];
                    const valB = b[sortByField];
                    
                    if (typeof valA === 'number' && typeof valB === 'number') {
                        return valA - valB;
                    }
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return valA.localeCompare(valB);
                    }
                    
                    // 處理缺少欄位的情況（將它們放到最後面）
                    if (valA === undefined || valA === null) return 1;
                    if (valB === undefined || valB === null) return -1;
                    
                    return String(valA).localeCompare(String(valB));
                });

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