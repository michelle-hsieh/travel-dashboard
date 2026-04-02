import { useState, useEffect, useCallback, useRef } from 'react';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import InlineEdit from '../components/shared/InlineEdit';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import RouteMap from '../components/shared/RouteMap';
import EmojiPicker from '../components/shared/EmojiPicker';
import type { Place, Day, Hotel, Flight, Note, ChecklistItem } from '../types';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, useDroppable, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../context/AuthContext';
import { useFirestoreQuery } from '../hooks/useFirestoreQuery';

const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function numEmoji(i: number) { return NUM_EMOJIS[i] ?? `${i + 1}`; }

interface PlannerPageProps {
  tripId: string;
  readOnly?: boolean;
}

const POOL_DAY_ID = 'pool';

export default function PlannerPage({ tripId, readOnly = false }: PlannerPageProps) {
  const { role, tripMeta, canRead, canWrite } = useAuth();

  const isAdmin = role === 'admin';
  const hasAccess = canRead('planner');

  if (!hasAccess) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🚫</p>
        <p>您沒有檢視行程規劃的權限</p>
      </div>
    );
  }

  // 判斷是否為唯讀模式 (頁面要求唯讀 OR 使用者無寫入權限)
  const isReadOnly = readOnly || !canWrite('planner');

  const days = useFirestoreQuery<Day>(tripId, 'days', 'sortOrder');
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  const allPlaces = useFirestoreQuery<Place>(tripId, 'places', 'sortOrder');
  const poolCount = allPlaces?.filter(p => p.dayId === POOL_DAY_ID).length ?? 0;

  const syncingRef = useRef(false);

  // 自動同步 Days 數量
  useEffect(() => {
    if (!isAdmin || !tripId || !tripMeta?.startDate || !tripMeta?.endDate || !days) return;
    if (syncingRef.current) return;

    const start = new Date(tripMeta.startDate);
    const end = new Date(tripMeta.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const expectedDates: string[] = [];
    let curr = new Date(start);
    while (curr <= end) {
      expectedDates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    // Check if sync is needed
    const needsCleanup = days.some((d, idx, arr) => d.date && arr.findIndex(x => x.date === d.date) !== idx);
    const missingDays = expectedDates.some(ed => !days.find(d => d.date === ed));
    const needsUpdate = days.some(d => {
      const idx = expectedDates.indexOf(d.date!);
      return idx !== -1 && (d.dayNumber !== idx + 1 || d.sortOrder !== idx);
    });

    if (!needsCleanup && !missingDays && !needsUpdate) return;

    const syncDays = async () => {
      syncingRef.current = true;
      try {
        // 1. Cleanup duplicates
        const dateCount: Record<string, Day[]> = {};
        for (const d of days) {
          if (d.date) {
            if (!dateCount[d.date]) dateCount[d.date] = [];
            dateCount[d.date].push(d);
          }
        }
        for (const date in dateCount) {
          const arr = dateCount[date];
          if (arr.length > 1) {
            for (let i = 1; i < arr.length; i++) {
              await deleteDoc(doc(firestore, 'trips', String(tripId), 'days', String(arr[i].id!)));
            }
          }
        }

        // Wait a bit for Firestore to propagate if needed, but we can also just local filter
        const currentDays = days.filter(d => !d.date || dateCount[d.date][0].id === d.id);

        // 2. Add missing and update order
        for (let i = 0; i < expectedDates.length; i++) {
          const dateStr = expectedDates[i];
          const existing = currentDays.find(d => d.date === dateStr);
          if (!existing) {
            await addDoc(collection(firestore, 'trips', String(tripId), 'days'), {
              tripId: String(tripId),
              date: dateStr,
              dayNumber: i + 1,
              sortOrder: i,
            });
          } else if (existing.dayNumber !== i + 1 || existing.sortOrder !== i) {
            await updateDoc(doc(firestore, 'trips', String(tripId), 'days', String(existing.id!)), {
              dayNumber: i + 1,
              sortOrder: i,
            });
          }
        }
      } finally {
        syncingRef.current = false;
      }
    };
    syncDays();
  }, [tripId, tripMeta?.startDate, tripMeta?.endDate, days, isAdmin]);

  const activeTab = selectedTab ?? (days && days.length > 0 ? days[0].id! : null);

  return (
    <div>
      <div className="page-header">
        <h1>每日行程 🗓️</h1>
      </div>

      <div className="chip-bar">
        <button
          className={`chip ${activeTab === 'pool' ? 'active' : ''}`}
          onClick={() => setSelectedTab('pool')}
          style={{ position: 'relative' }}
        >
          📋 待排
          {poolCount > 0 && (
            <span style={{ marginLeft: 4, background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {poolCount}
            </span>
          )}
        </button>
        {days?.map(day => (
          <button
            key={day.id}
            className={`chip ${day.id === activeTab ? 'active' : ''}`}
            onClick={() => setSelectedTab(day.id!)}
          >
            Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}
          </button>
        ))}
      </div>

      {activeTab === 'pool' ? (
        <PoolSection tripId={tripId} days={days ?? []} allPlaces={allPlaces ?? []} readOnly={isReadOnly} />
      ) : activeTab != null ? (
        <DayDetail 
          dayId={activeTab} 
          tripId={tripId} 
          days={days ?? []} 
          allPlaces={allPlaces ?? []} 
          readOnly={isReadOnly} 
        />
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>📅</p>
          <p>請先在首頁設定旅程的開始與結束日期。</p>
        </div>
      )}
    </div>
  );
}

/* ===================== POOL (待排) ===================== */
function PoolSection({ tripId, days, allPlaces, readOnly = false }: { tripId: string; days: Day[], allPlaces: Place[], readOnly?: boolean }) {
  const places = allPlaces.filter(p => p.dayId === POOL_DAY_ID);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const addPlace = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'places'), {
      dayId: POOL_DAY_ID,
      tripId: String(tripId),
      name: '',
      sortOrder: places.length,
      travelMode: 'TRANSIT',
    });
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over || active.id === over.id || !places || !tripId) return;
    const oldIndex = places.findIndex(p => p.id === active.id);
    const newIndex = places.findIndex(p => p.id === over.id);
    const reordered = arrayMove(places, oldIndex, newIndex);
    await Promise.all(
      reordered.map((p, i) => updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)), { sortOrder: i }))
    );
  }, [places, tripId, readOnly]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const allMapPoints = places.filter(p => p.lat && p.lng).map((p, i) => ({ 
    name: p.name || p.address || `座標地點 (${p.lat?.toFixed(4)}, ${p.lng?.toFixed(4)})`, 
    lat: p.lat!, 
    lng: p.lng!, 
    label: p.icon || numEmoji(i) 
  }));

  return (
    <div>
      <div className="map-container" style={allMapPoints.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-muted)' } : undefined}>
        {allMapPoints.length > 0 && isOnline ? <RouteMap places={allMapPoints} /> : <span>{!isOnline ? '📡 離線中 — 無法顯示地圖' : '🗺️ 新增有地標的景點以顯示地圖'}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)' }}>
        <span className="section-title" style={{ margin: 0 }}>📋 待排景點</span>
        {!readOnly && <button className="btn btn-primary" onClick={addPlace} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>}
      </div>

      {places.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
            {places.map((place, index) => (
              <div key={place.id}><SortablePlaceCard place={place} index={index} days={days} tripId={tripId} readOnly={readOnly} /></div>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <div className="empty-state"><p>想去但還沒排進行程的景點可以先放這裡！</p></div>
      )}
    </div>
  );
}

/* ===================== DAY DETAIL ===================== */
function DayDetail({ dayId, tripId, days, allPlaces, readOnly = false }: { dayId: string; tripId: string; days: Day[]; allPlaces: Place[]; readOnly?: boolean }) {
  const day = days.find(d => d.id === dayId);
  const placesInDay = allPlaces.filter(p => p.dayId === dayId);
  const places = placesInDay.filter(p => !p.isBackup);
  const backupPlaces = placesInDay.filter(p => p.isBackup);

  const hotels = useFirestoreQuery<Hotel>(tripId, 'hotels', 'sortOrder');
  const flights = useFirestoreQuery<Flight>(tripId, 'flights', 'sortOrder');

  const { startPoint, endPoint } = useItineraryBounds(day, days, hotels, flights);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragPlace = allPlaces.find(p => p.id === activeDragId) ?? null;

  const addPlace = async (isBackup = false) => {
    if (readOnly || !tripId || !dayId) return;
    const list = isBackup ? backupPlaces : places;
    await addDoc(collection(firestore, 'trips', String(tripId), 'places'), {
      dayId: String(dayId), tripId: String(tripId), name: '', sortOrder: list.length, travelMode: 'TRANSIT', isBackup,
    });
  };

  const promoteBackup = async (placeId: string) => {
    if (readOnly || !tripId || !placeId) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(placeId)), { isBackup: false, sortOrder: places.length });
  };

  const handleDragStart = useCallback((event: DragStartEvent) => setActiveDragId(event.active.id as string), []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    if (readOnly) return;
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !allPlaces || !tripId) return;

    const draggedPlace = allPlaces.find(p => p.id === active.id);
    if (!draggedPlace) return;

    const overId = over.id as string;

    if (overId === 'droppable-itinerary') {
      if (draggedPlace.isBackup) await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(draggedPlace.id!)), { isBackup: false, sortOrder: places.length });
      return;
    }
    if (overId === 'droppable-backup') {
      if (!draggedPlace.isBackup) await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(draggedPlace.id!)), { isBackup: true, sortOrder: backupPlaces.length });
      return;
    }

    const overPlace = allPlaces.find(p => p.id === overId);
    if (!overPlace) return;

    const fromBackup = !!draggedPlace.isBackup;
    const toBackup = !!overPlace.isBackup;

    if (fromBackup === toBackup) {
      const list = fromBackup ? backupPlaces : places;
      const oldIndex = list.findIndex(p => p.id === active.id);
      const newIndex = list.findIndex(p => p.id === overId);
      const reordered = arrayMove(list, oldIndex, newIndex);
      await Promise.all(reordered.map((p, i) => updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)), { sortOrder: i })));
    } else {
      const targetList = toBackup ? [...backupPlaces] : [...places];
      const dropIndex = targetList.findIndex(p => p.id === overId);
      await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(draggedPlace.id!)), { isBackup: toBackup, sortOrder: dropIndex });
      targetList.splice(dropIndex, 0, draggedPlace);
      await Promise.all(targetList.map((p, i) => updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)), { sortOrder: i })));

      const sourceList = fromBackup ? backupPlaces.filter(p => p.id !== draggedPlace.id) : places.filter(p => p.id !== draggedPlace.id);
      await Promise.all(sourceList.map((p, i) => updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)), { sortOrder: i })));
    }
  }, [allPlaces, places, backupPlaces, tripId, readOnly]);

  const allMapPoints = [
    ...(startPoint ? [startPoint] : []),
    ...placesInDay.filter(p => p.lat && p.lng).map((p, i) => ({ 
      name: p.name || p.address || `座標地點 (${p.lat?.toFixed(4)}, ${p.lng?.toFixed(4)})`, 
      lat: p.lat!, 
      lng: p.lng!, 
      label: p.icon || numEmoji(i) 
    })),
    ...(endPoint ? [endPoint] : [])
  ];

  return (
    <div>
      <div className="map-container" style={allMapPoints.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-muted)' } : undefined}>
        {allMapPoints.length > 0 && isOnline ? <RouteMap places={allMapPoints} /> : <span>{!isOnline ? '📡 離線中 — 無法顯示地圖' : '🗺️ 景點座標完整後將自動顯示地圖'}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <span className="section-title" style={{ margin: 0 }}>Day {day?.dayNumber} · {day?.date}</span>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => addPlace()} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <DroppableZone id="droppable-itinerary" isOver={activeDragPlace?.isBackup}>
          <div style={{ display: 'grid', gap: 0 }}>
            {startPoint && (
              <>
                <VirtualPointCard point={startPoint} />
                {places.length > 0 && <TravelSegment from={startPoint} to={places[0]} tripId={tripId} />}
              </>
            )}

            {places && places.length > 0 ? (
              <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
                {places.map((place, index) => (
                  <div key={place.id}>
                    <SortablePlaceCard place={place} index={index} days={days} tripId={tripId} readOnly={readOnly} />
                    {index < places.length - 1 && <TravelSegment from={place} to={places[index + 1]} tripId={tripId} />}
                  </div>
                ))}
              </SortableContext>
            ) : (
              !startPoint && !endPoint && <div className="empty-state"><p>還沒有景點，新增你的第一個站吧！</p></div>
            )}

            {endPoint && (
              <>
                {places.length > 0 && <TravelSegment from={places[places.length - 1]} to={endPoint} tripId={tripId} />}
                {places.length === 0 && startPoint && <TravelSegment from={startPoint} to={endPoint} tripId={tripId} />}
                <VirtualPointCard point={endPoint} />
              </>
            )}
          </div>
        </DroppableZone>

        <div style={{ marginTop: 'var(--sp-lg)', borderTop: '2px dashed var(--border)', paddingTop: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)' }}>
            <span className="section-title" style={{ margin: 0, fontSize: '0.9rem' }}>🔸 每日備案</span>
            {!readOnly && <button className="btn btn-secondary" onClick={() => addPlace(true)} style={{ fontSize: '0.75rem' }}>＋ 新增備案</button>}
          </div>
          <DroppableZone id="droppable-backup" isOver={activeDragPlace != null && !activeDragPlace.isBackup}>
            {backupPlaces && backupPlaces.length > 0 ? (
              <SortableContext items={backupPlaces.map(p => p.id!)} strategy={verticalListSortingStrategy}>
                {backupPlaces.map((place, index) => (
                  <div key={place.id}><SortablePlaceCard place={place} index={index} days={days} tripId={tripId} onPromote={() => promoteBackup(place.id!)} isBackup readOnly={readOnly} /></div>
                ))}
              </SortableContext>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--sp-md)' }}><p style={{ fontSize: '0.85rem' }}>備案景點會顯示在地圖上，方便臨時調整行程。</p></div>
            )}
          </DroppableZone>
        </div>

        <DragOverlay>
          {activeDragPlace ? <div style={{ opacity: 0.85, transform: 'scale(1.02)' }}><PlaceCard place={activeDragPlace} index={0} days={days} tripId={tripId} dragHandleProps={{}} readOnly={readOnly} /></div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ===================== HELPERS & SUB-COMPONENTS ===================== */

function VirtualPointCard({ point }: { point: any }) {
  return (
    <div className="card virtual-card" style={{ marginBottom: 'var(--sp-sm)', border: '1px solid var(--accent)', background: 'rgba(var(--accent-rgb, 176,141,122), 0.05)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
        <div style={{ fontSize: '1.2rem', width: 32, textAlign: 'center' }}>{point.label}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{point.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {point.type === 'airport' ? '依航班資訊自動加入' : '依住宿資訊自動加入'}
          </div>
        </div>
      </div>
    </div>
  );
}

function useGeocode(query: string) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!query) return;
    const provider = new OpenStreetMapProvider({ params: { 'accept-language': 'zh-TW,ja,en', countrycodes: 'jp,tw', limit: 1 } });
    provider.search({ query }).then((res: any) => { if (res && res[0]) setCoords({ lat: res[0].y, lng: res[0].x }); }).catch(() => { });
  }, [query]);
  return coords;
}

function DroppableZone({ id, isOver, children }: { id: string; isOver?: boolean | null; children: React.ReactNode }) {
  const { setNodeRef, isOver: isOverCurrent } = useDroppable({ id });
  const highlight = isOver && isOverCurrent;
  return <div ref={setNodeRef} style={{ minHeight: 48, borderRadius: 'var(--radius)', border: highlight ? '2px dashed var(--accent)' : '2px dashed transparent', background: highlight ? 'rgba(var(--accent-rgb, 99,102,241), 0.06)' : undefined, transition: 'border-color 0.2s, background 0.2s', padding: highlight ? 'var(--sp-xs)' : undefined }}>{children}</div>;
}

function SortablePlaceCard({ place, index, days, tripId, onPromote, isBackup, readOnly = false }: { place: Place; index: number; days: Day[]; tripId: string; onPromote?: () => void; isBackup?: boolean; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id!, disabled: readOnly });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined };
  return <div ref={setNodeRef} style={style}><PlaceCard place={place} index={index} days={days} tripId={tripId} dragHandleProps={readOnly ? {} : { ...attributes, ...listeners }} onPromote={onPromote} isBackup={isBackup} readOnly={readOnly} /></div>;
}

function PlaceCard({ place, index, days, tripId, dragHandleProps, onPromote, isBackup, readOnly = false }: { place: Place; index: number; days: Day[]; tripId: string; dragHandleProps: Record<string, unknown>; onPromote?: () => void; isBackup?: boolean; readOnly?: boolean }) {
  const { role } = useAuth();
  const notes = useFirestoreQuery<Note>(tripId, 'notes', 'sortOrder')?.filter(n => n.placeId === place.id);
  const checklistItems = useFirestoreQuery<ChecklistItem>(tripId, 'checklistItems', 'sortOrder');

  const isAdmin = role === 'admin';

  const linkedChecklist = checklistItems?.filter(item => 
    item.location && place.name && item.location.trim().toLowerCase() === place.name.trim().toLowerCase()
  ) || [];

  const updatePlace = async (updates: Partial<Place>) => {
    if (readOnly || !tripId || !place.id) return;
    const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {} as any);
    if (Object.keys(cleanUpdates).length === 0) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(place.id!)), cleanUpdates);
  };

  const deletePlace = async () => {
    if (readOnly || !confirm('確定刪除此景點嗎？') || !tripId || !place.id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'places', String(place.id!)));
  };

  const addNote = async (type: 'text' | 'url') => {
    if (readOnly || !tripId || !place.id) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'notes'), {
      placeId: String(place.id), type, content: '', url: type === 'url' ? '' : null, sortOrder: notes?.length ?? 0,
    });
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
        {!readOnly && <div className="drag-handle" {...dragHandleProps}>⠿</div>}
        <EmojiPicker value={place.icon} fallback={numEmoji(index)} onSelect={(emoji) => updatePlace({ icon: emoji })} readOnly={readOnly} />
        <div style={{ flex: 1 }}>
          {readOnly ? (
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{place.name || '未命名地點'}</h3>
          ) : (
            <PlaceAutocomplete value={place.name} onSelect={(r) => updatePlace(r)} placeholder="搜尋地點..." />
          )}
          {place.address && <div style={{ marginTop: 'var(--sp-xs)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>📍 {place.address}</div>}
          {(!place.lat || !place.lng) && place.name && !readOnly && (
            <div style={{ marginTop: 'var(--sp-xs)', fontSize: '0.75rem', color: 'var(--danger)', background: 'rgba(var(--danger-rgb, 239,68,68), 0.1)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️ 找不到地標</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-xs)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <InlineEdit value={place.amount != null ? `${place.amount}` : ''} onSave={(v) => updatePlace({ amount: parseFloat(v) || undefined })} placeholder="💰 金額" readOnly={readOnly} />
            <InlineEdit value={place.currency || ''} onSave={(v) => updatePlace({ currency: v })} placeholder="幣別 (TWD)" readOnly={readOnly} />
            {readOnly ? (
              <span style={{ fontSize: '0.75rem' }}>
                {place.travelMode === 'WALKING' ? '🚶 步行' : place.travelMode === 'DRIVING' ? '🚗 開車' : '🚇 大眾運輸'}
              </span>
            ) : (
              <select value={place.travelMode || 'TRANSIT'} onChange={(e) => updatePlace({ travelMode: e.target.value as any })} style={{ width: 'auto', fontSize: '0.75rem', padding: '2px 6px' }}>
                <option value="WALKING">🚶 步行</option>
                <option value="TRANSIT">🚇 大眾運輸</option>
                <option value="DRIVING">🚗 開車</option>
              </select>
            )}
            {!readOnly && (
              <select value={`${place.dayId}:${place.isBackup ? '1' : '0'}`} onChange={async (e) => {
                const [newDayId, backupStr] = e.target.value.split(':');
                await updatePlace({ dayId: newDayId, isBackup: backupStr === '1' });
              }} style={{ width: 'auto', fontSize: '0.75rem', padding: '2px 6px' }}>
                <option value={`${POOL_DAY_ID}:0`}>📋 待排</option>
                {days.map(d => (
                  <optgroup key={d.id} label={`Day ${d.dayNumber}${d.date ? ` · ${d.date}` : ''}`}>
                    <option value={`${d.id!}:0`}>Day {d.dayNumber} 行程</option>
                    <option value={`${d.id!}:1`}>Day {d.dayNumber} 備案</option>
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          {notes?.map(note => (
            <div key={note.id} style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'flex-start', marginTop: 'var(--sp-xs)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{note.type === 'url' ? '🔗' : '📝'}</span>
              {note.type === 'url' && note.url ? (
                <a href={note.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{note.content || note.url}</a>
              ) : (
                <InlineEdit value={note.content || note.url || ''} onSave={(v) => updateDoc(doc(firestore, 'trips', String(tripId), 'notes', String(note.id!)), { content: v })} placeholder="備註..." multiline readOnly={readOnly} />
              )}
            </div>
          ))}
          {isAdmin && linkedChecklist.length > 0 && (
            <div style={{ marginTop: 'var(--sp-sm)', background: 'rgba(var(--accent-rgb, 176,141,122), 0.05)', borderRadius: '8px', padding: 'var(--sp-xs) var(--sp-sm)', border: '1px solid rgba(var(--accent-rgb, 176,141,122), 0.1)' }}>
              {linkedChecklist.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', padding: '4px 0', opacity: item.checked ? 0.5 : 1 }}>
                  <input type="checkbox" checked={item.checked} onChange={(e) => updateDoc(doc(firestore, 'trips', String(tripId), 'checklistItems', String(item.id!)), { checked: e.target.checked })} style={{ width: 14, height: 14 }} disabled={readOnly}/>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-xs)', marginTop: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            {!readOnly && isBackup && onPromote && <button className="btn btn-primary" onClick={onPromote} style={{ fontSize: '0.75rem' }}>➕ 加入行程</button>}
            {!readOnly && <button className="btn btn-secondary" onClick={() => addNote('text')} style={{ fontSize: '0.75rem' }}>📝 備註</button>}
            {!readOnly && <button className="btn btn-secondary" onClick={() => addNote('url')} style={{ fontSize: '0.75rem' }}>🔗 連結</button>}
          </div>
        </div>
        {!readOnly && <button className="btn-icon btn-danger" onClick={deletePlace} style={{ fontSize: '0.7rem' }}>🗑️</button>}
      </div>
    </div>
  );
}

function TravelSegment({ from, to, tripId }: { from: Place; to: Place; tripId: string }) {
  const dist = (from.lat && from.lng && to.lat && to.lng) ? calculateDistance(from.lat, from.lng, to.lat, to.lng) : null;
  if (!dist) return null;
  const mode = from.travelMode || 'TRANSIT';
  const labels: Record<string, string> = { WALKING: '🚶 步行', TRANSIT: '🚇 大眾運輸', DRIVING: '🚗 開車' };
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from.name || '')}&destination=${encodeURIComponent(to.name || '')}&travelmode=${mode.toLowerCase()}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: 'var(--sp-xs) 0', marginLeft: 'var(--sp-xl)', opacity: 0.8 }}>
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.75rem' }}>
        {labels[mode]} {dist.toFixed(1)} km
      </a>
      <div style={{ flex: 1, height: 1, borderTop: '1px dashed var(--border)' }} />
    </div>
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function useItineraryBounds(day: Day | undefined, days: Day[], hotels: Hotel[] | undefined, flights: Flight[] | undefined) {
  const isFirstDay = days.length > 0 && days[0].id === day?.id;
  const isLastDay = days.length > 0 && days[days.length - 1].id === day?.id;
  const arrivalFlight = isFirstDay && flights?.length ? flights[0] : undefined;
  const departureFlight = isLastDay && flights?.length ? flights[flights.length - 1] : undefined;
  const arrivalAirportCoords = useGeocode(arrivalFlight?.arrivalAirport ? arrivalFlight.arrivalAirport + ' airport' : '');
  const departureAirportCoords = useGeocode(departureFlight?.departureAirport ? departureFlight.departureAirport + ' airport' : '');
  const today = day?.date;
  let startPoint: any = null;
  let endPoint: any = null;
  if (isFirstDay && arrivalFlight && arrivalAirportCoords) {
    startPoint = { name: arrivalFlight.arrivalAirport || '機場', ...arrivalAirportCoords, label: '🛫', isVirtual: true, type: 'airport' };
  } else if (today) {
    const hOut = hotels?.find(h => h.checkOut === today);
    if (hOut && hOut.lat && hOut.lng) startPoint = { name: hOut.name, lat: hOut.lat, lng: hOut.lng, label: '🏨', isVirtual: true, type: 'hotel' };
  }
  if (isLastDay && departureFlight && departureAirportCoords) {
    endPoint = { name: departureFlight.departureAirport || '機場', ...departureAirportCoords, label: '🛬', isVirtual: true, type: 'airport' };
  } else if (today) {
    const hIn = hotels?.find(h => h.checkIn === today);
    if (hIn && hIn.lat && hIn.lng) endPoint = { name: hIn.name, lat: hIn.lat, lng: hIn.lng, label: '🏨', isVirtual: true, type: 'hotel' };
  }
  return { startPoint, endPoint };
}
