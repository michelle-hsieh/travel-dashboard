import { collection, getDocs, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { getBatchCoordinatesFromAI } from '../services/aiService';

const SUB_COLLECTIONS = [
  'days', 'places', 'notes', 'attachments', 'flights', 'hotels', 
  'tickets', 'checklistItems', 'budgetItems', 'resources', 'tripNotes'
];

/**
 * Firestore doesn't allow 'undefined' values. This helper converts them to 'null' or removes them.
 */
function sanitize(data: any) {
  const result: any = {};
  for (const key in data) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
}

export async function exportTrip(tripId: string) {
  if (!tripId) throw new Error('未提供旅程 ID');

  const tripDoc = await getDoc(doc(firestore, 'trips', tripId));
  if (!tripDoc.exists()) throw new Error('找不該旅程');

  const tripData = tripDoc.data();
  const exportData: any = {
    ...tripData,
    id: tripId,
    subcollections: {}
  };

  for (const sub of SUB_COLLECTIONS) {
    const snap = await getDocs(collection(firestore, 'trips', tripId, sub));
    exportData.subcollections[sub] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  }

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `trip-export-${tripData.name || tripId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importTrip(
  jsonString: string, 
  userId: string, 
  userEmail: string,
  onProgress?: (msg: string) => void
) {
  const data = JSON.parse(jsonString);
  if (!data.name) throw new Error('無效的旅程資料');

  console.log('[importTrip] Incoming data keys:', Object.keys(data));
  console.log('[importTrip] data.subcollections keys:', data.subcollections ? Object.keys(data.subcollections) : 'N/A');

  onProgress?.('正在建立旅程主文件...');
  
  // 1. Create main trip
  const newTrip = {
    name: data.name,
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    createdAt: Date.now(),
    adminUid: userId,
    adminEmail: userEmail.toLowerCase(),
    collaborators: {},
    collaboratorEmails: [],
    memberEmails: [],
    daysCount: data.daysCount || 0,
    placesCount: data.placesCount || 0,
    publicPermissions: data.publicPermissions || {
      planner: 'none', flights: 'none', hotels: 'none', tickets: 'none', resources: 'none'
    }
  };

  const tripRef = await addDoc(collection(firestore, 'trips'), newTrip);
  const newTripId = tripRef.id;
  console.log('[importTrip] Created trip:', newTripId);

  // Helper to find data in the object regardless of casing or underscores
  const findSub = (obj: any, key: string): any[] | null => {
    if (!obj || typeof obj !== 'object') return null;
    const target = key.toLowerCase().replace(/_/g, '');
    const foundKey = Object.keys(obj).find(k => k.toLowerCase().replace(/_/g, '') === target);
    const val = foundKey ? obj[foundKey] : null;
    return Array.isArray(val) ? val : null;
  };

  // Try multiple levels to find subcollections data
  // AI models may put data at: data.subcollections.X, data.X, or data.tripData.subcollections.X
  const subs = data.subcollections || data;
  console.log('[importTrip] Resolved subs keys:', Object.keys(subs));

  const dayIdMap: Record<string, string> = {};
  const placeIdMap: Record<string, string> = {};

  // 1. Import Days & extract nested places
  const days = findSub(subs, 'days') || [];
  const topLevelPlaces = findSub(subs, 'places') || [];
  const allPlaces: any[] = [...topLevelPlaces];

  console.log('[importTrip] Found days:', days.length, '| top-level places:', topLevelPlaces.length);

  if (days.length > 0) {
    onProgress?.(`正在匯入天數 (${days.length})...`);
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const d = days[dayIdx];
      const oldId = d.id || `day-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Extract nested places/activities/stops/items — AI models use various key names
      const nestedPlaces = d.places || d.activities || d.stops || d.items || d.attractions || [];
      const { id: _, tripId: __, places: _p, activities: _a, stops: _s, items: _i, attractions: _at, ...cleanDay } = d;
      
      const docRef = await addDoc(collection(firestore, 'trips', newTripId, 'days'), sanitize({
        ...cleanDay,
        tripId: newTripId,
        sortOrder: cleanDay.sortOrder ?? dayIdx  // Ensure sortOrder exists!
      }));
      dayIdMap[oldId] = docRef.id;

      // If AI put places inside days, extract them
      if (Array.isArray(nestedPlaces) && nestedPlaces.length > 0) {
        console.log(`[importTrip] Day "${oldId}" has ${nestedPlaces.length} nested places`);
        nestedPlaces.forEach((p: any, idx: number) => {
          allPlaces.push({ 
            ...p, 
            dayId: oldId,
            sortOrder: p.sortOrder ?? idx  // Preserve order
          });
        });
      }
    }
  }

  console.log('[importTrip] Total places to import:', allPlaces.length);

  // 2. Import Places (including nested ones)
  if (allPlaces.length > 0) {
    onProgress?.(`正在匯入地點 (${allPlaces.length})...`);
    for (let placeIdx = 0; placeIdx < allPlaces.length; placeIdx++) {
      const p = allPlaces[placeIdx];
      const oldId = p.id || `gen-p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const { id: _, tripId: __, dayId: _oldDayId, ...cleanPlace } = p;

      // Always put places in the pool (待排) — AI dayId mapping is unreliable.
      // Users can drag them to the correct days manually.
      const dayId = 'pool';

      const docRef = await addDoc(collection(firestore, 'trips', newTripId, 'places'), sanitize({
        ...cleanPlace,
        tripId: newTripId,
        dayId: dayId,
        sortOrder: cleanPlace.sortOrder ?? placeIdx  // Ensure sortOrder exists!
      }));
      placeIdMap[oldId] = docRef.id;
    }
  }

  // 3. Import Notes
  const notes = findSub(subs, 'notes');
  if (notes && notes.length > 0) {
    onProgress?.(`正在匯入筆記 (${notes.length})...`);
    for (const n of notes) {
      const { id: _, placeId: oldPlaceId, ...cleanNote } = n;
      await addDoc(collection(firestore, 'trips', newTripId, 'notes'), sanitize({
        ...cleanNote,
        placeId: placeIdMap[oldPlaceId] || oldPlaceId
      }));
    }
  }

  // 4. Import Attachments
  const attaches = findSub(subs, 'attachments');
  if (attaches && attaches.length > 0) {
    onProgress?.(`正在匯入附件 (${attaches.length})...`);
    for (const a of attaches) {
      const { id: _, parentId: oldParentId, ...cleanAttach } = a;
      await addDoc(collection(firestore, 'trips', newTripId, 'attachments'), sanitize({
        ...cleanAttach,
        parentId: placeIdMap[oldParentId] || oldParentId
      }));
    }
  }

  // 5. Import "Flat" subcollections
  const flatKeys = [
    { key: 'flights', label: '機票' },
    { key: 'hotels', label: '住宿' },
    { key: 'tickets', label: '票券' },
    { key: 'checklistItems', label: '清單' },
    { key: 'budgetItems', label: '預算' },
    { key: 'resources', label: '連結' },
    { key: 'tripNotes', label: '旅程備忘錄' }
  ];

  for (const { key, label } of flatKeys) {
    const items = findSub(subs, key);
    if (items && items.length > 0) {
      onProgress?.(`正在匯入 ${label} (${items.length})...`);
      console.log(`[importTrip] Importing ${key}: ${items.length} items`);
      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const { id: _, tripId: __, ...cleanItem } = item;
        await addDoc(collection(firestore, 'trips', newTripId, key), sanitize({
          ...cleanItem,
          tripId: newTripId,
          sortOrder: cleanItem.sortOrder ?? itemIdx  // Ensure sortOrder exists!
        }));
      }
    } else {
      console.log(`[importTrip] No data found for subcollection: ${key}`);
    }
  }

  console.log('[importTrip] ✅ Import complete! Trip ID:', newTripId);
  onProgress?.('匯入完成！');
  return newTripId;
}

export async function geocodeTripPlaces(tripId: string, onProgress?: (msg: string) => void) {
  if (!tripId) throw new Error('未提供旅程 ID');

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  // Handle both 'places' and 'hotels'
  const collections = ['places', 'hotels'];
  
  for (const sub of collections) {
    const snap = await getDocs(collection(firestore, 'trips', tripId, sub));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const missing = items.filter(it => (it.lat === undefined || it.lat === null || it.lat === 0) && it.name);

    if (missing.length === 0) continue;

    onProgress?.(`正在為 ${sub} 標註地圖座標 (${missing.length} 個待處理)...`);

    const CHUNK_SIZE = 5; // Smaller chunks to avoid rate limits
    const failedChunks: typeof missing[] = [];

    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
      onProgress?.(`正在批次查詢第 ${batchNum} 組座標 (${chunk.length} 個)...`);

      try {
        const batchResults = await getBatchCoordinatesFromAI(
          chunk.map(item => ({ id: item.id, name: item.name, address: item.address }))
        );

        let updated = 0;
        for (const item of chunk) {
          const coords = batchResults[item.id];
          if (coords) {
            await updateDoc(doc(firestore, 'trips', tripId, sub, item.id), { 
              lat: coords.lat, 
              lng: coords.lng 
            });
            updated++;
          }
        }
        onProgress?.(`第 ${batchNum} 組完成：${updated}/${chunk.length} 個景點已標註`);
        
        // Longer pause between batches to stay within rate limits
        await sleep(8000);
      } catch (err: any) {
        console.error(`Batch ${batchNum} geocoding failed:`, err);
        failedChunks.push(chunk);
        onProgress?.(`第 ${batchNum} 組失敗，將在最後重試...`);
        // Wait longer after a failure before trying next batch
        await sleep(20000);
      }
    }

    // Retry failed batches once with longer delays
    if (failedChunks.length > 0) {
      onProgress?.(`正在重試 ${failedChunks.length} 組失敗的查詢...`);
      await sleep(30000); // Wait 30s before retrying

      for (let r = 0; r < failedChunks.length; r++) {
        const chunk = failedChunks[r];
        onProgress?.(`重試第 ${r + 1}/${failedChunks.length} 組 (${chunk.length} 個)...`);
        
        try {
          const batchResults = await getBatchCoordinatesFromAI(
            chunk.map(item => ({ id: item.id, name: item.name, address: item.address }))
          );

          for (const item of chunk) {
            const coords = batchResults[item.id];
            if (coords) {
              await updateDoc(doc(firestore, 'trips', tripId, sub, item.id), { 
                lat: coords.lat, 
                lng: coords.lng 
              });
            }
          }
        } catch (retryErr) {
          console.error(`Retry failed for batch:`, retryErr);
          onProgress?.(`重試仍然失敗，部分景點未能標註座標`);
        }
        await sleep(15000);
      }
    }
  }

  onProgress?.('全數地圖標註完成！');
}
