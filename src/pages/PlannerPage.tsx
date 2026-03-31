import { useState, useEffect, useCallback } from 'react';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import InlineEdit from '../components/shared/InlineEdit';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import RouteMap from '../components/shared/RouteMap';
import EmojiPicker from '../components/shared/EmojiPicker';
import type { Place, Day, Hotel, Flight, Note } from '../types';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, useDroppable, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../context/AuthContext';
import { normalizeEmail } from '../utils/emails';
import { useFirestoreQuery } from '../hooks/useFirestoreQuery';

const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function numEmoji(i: number) { return NUM_EMOJIS[i] ?? `${i + 1}`; }

interface PlannerPageProps {
  tripId: string; // ✅
  readOnly?: boolean;
}

const POOL_DAY_ID = 'pool'; // ✅ 改為字串

export default function PlannerPage({ tripId, readOnly = false }: PlannerPageProps) {
  const { role, user, tripMeta } = useAuth();

  const isAdmin = role === 'admin';
  const myEmail = user?.email ? normalizeEmail(user.email) : '';
  const collabs = tripMeta?.collaborators || {};
  const myCollab = collabs[myEmail] || Object.values(collabs).find((c: any) => normalizeEmail(c.email) === myEmail);
  const perms = myCollab?.permissions || {};
  const hasAccess = isAdmin || (myCollab && perms['planner'] !== 'none');

  if (!hasAccess) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🚫</p>
        <p>您沒有檢視行程規劃的權限</p>
      </div>
    );
  }

  if (readOnly) {
    return <ReadOnlyPlanner tripId={tripId} />;
  }

  const days = useFirestoreQuery<Day>(tripId, 'days', 'sortOrder');
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  const allPlaces = useFirestoreQuery<Place>(tripId, 'places', 'sortOrder');
  const poolCount = allPlaces?.filter(p => p.dayId === POOL_DAY_ID).length ?? 0;

  const activeTab = selectedTab ?? (days && days.length > 0 ? days[0].id! : null);

  const addDay = async () => {
    if (readOnly || !tripId) return;
    const count = days?.length ?? 0;
    // 因為沒有存 trip 的 date，這裡先簡化不帶入 date，由使用者手動輸入
    await addDoc(collection(firestore, 'trips', String(tripId), 'days'), {
      tripId: String(tripId),
      date: '',
      dayNumber: count + 1,
      sortOrder: count,
    });
  };

  const deleteDay = async (dayId: string) => {
    if (!confirm('確定刪除這天及所有景點嗎？') || !tripId || !dayId) return;
    const placesInDay = allPlaces?.filter(p => p.dayId === dayId) || [];

    // 刪除該天的所有景點
    for (const p of placesInDay) {
      await deleteDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)));
    }
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'days', String(dayId)));
    if (selectedTab === dayId) setSelectedTab(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>每日行程 🗓️</h1>
        {!readOnly && <button className="btn btn-primary" onClick={addDay}>＋ 新增天數</button>}
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
        <PoolSection tripId={tripId} days={days ?? []} allPlaces={allPlaces ?? []} />
      ) : activeTab != null ? (
        <DayDetail dayId={activeTab} tripId={tripId} days={days ?? []} allPlaces={allPlaces ?? []} onDeleteDay={() => deleteDay(activeTab)} />
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>📅</p>
          <p>還沒有天數，新增天數開始規劃吧！</p>
        </div>
      )}
    </div>
  );
}

function ReadOnlyPlanner({ tripId }: { tripId: string }) {
  const days = useFirestoreQuery<Day>(tripId, 'days', 'sortOrder');
  const allPlaces = useFirestoreQuery<Place>(tripId, 'places', 'sortOrder');
  const poolPlaces = allPlaces?.filter(p => p.dayId === POOL_DAY_ID);

  return (
    <div>
      <div className="page-header"><h1>行程（只讀）</h1></div>
      <div className="chip-bar">
        <span className="chip active">🧺 未分配 ({poolPlaces?.length ?? 0})</span>
        {days?.map((day, idx) => <span key={day.id} className="chip">{numEmoji(idx)} {day.date || '未設定日期'}</span>)}
      </div>
      <div style={{ display: 'grid', gap: 'var(--sp-md)', marginTop: 'var(--sp-md)' }}>
        {poolPlaces && poolPlaces.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-sm)' }}>未分配</h3>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {poolPlaces.map(p => <li key={p.id}>{p.name || '未命名地點'}</li>)}
            </ul>
          </div>
        )}
        {days?.map((day, idx) => (
          <ReadOnlyDay key={day.id} day={day} idx={idx} allPlaces={allPlaces ?? []} />
        ))}
      </div>
    </div>
  );
}

function ReadOnlyDay({ day, idx, allPlaces }: { day: Day; idx: number, allPlaces: Place[] }) {
  const places = allPlaces.filter(p => p.dayId === day.id);
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{numEmoji(idx)} {day.date || '未設定日期'}</h3>
      </div>
      {places && places.length > 0 ? (
        <ol style={{ marginTop: 'var(--sp-sm)', paddingLeft: '1.2rem' }}>
          {places.map(p => <li key={p.id}>{p.name || '未命名地點'}</li>)}
        </ol>
      ) : (
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--sp-sm)' }}>尚無地點</p>
      )}
    </div>
  );
}

/* ===================== POOL (待排) ===================== */
function PoolSection({ tripId, days, allPlaces }: { tripId: string; days: Day[], allPlaces: Place[] }) {
  const places = allPlaces.filter(p => p.dayId === POOL_DAY_ID);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const addPlace = async () => {
    if (!tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'places'), {
      dayId: POOL_DAY_ID,
      tripId: String(tripId),
      name: '',
      sortOrder: places.length,
      travelMode: 'TRANSIT',
    });
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !places || !tripId) return;
    const oldIndex = places.findIndex(p => p.id === active.id);
    const newIndex = places.findIndex(p => p.id === over.id);
    const reordered = arrayMove(places, oldIndex, newIndex);
    await Promise.all(
      reordered.map((p, i) => updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(p.id!)), { sortOrder: i }))
    );
  }, [places, tripId]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const allMapPoints = places.filter(p => p.lat && p.lng).map((p, i) => ({ name: p.name, lat: p.lat!, lng: p.lng!, label: p.icon || numEmoji(i) }));

  return (
    <div>
      <div className="map-container" style={allMapPoints.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-muted)' } : undefined}>
        {allMapPoints.length > 0 && isOnline ? <RouteMap places={allMapPoints} /> : <span>{!isOnline ? '📡 離線中 — 無法顯示地圖' : '🗺️ 新增有地標的景點以顯示地圖'}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)' }}>
        <span className="section-title" style={{ margin: 0 }}>📋 待排景點</span>
        <button className="btn btn-primary" onClick={addPlace} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>
      </div>

      {places.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
            {places.map((place, index) => (
              <div key={place.id}><SortablePlaceCard place={place} index={index} days={days} tripId={tripId} /></div>
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
function DayDetail({ dayId, tripId, days, allPlaces, onDeleteDay }: { dayId: string; tripId: string; days: Day[]; allPlaces: Place[]; onDeleteDay: () => void }) {
  const day = days.find(d => d.id === dayId);
  const placesInDay = allPlaces.filter(p => p.dayId === dayId);
  const places = placesInDay.filter(p => !p.isBackup);
  const backupPlaces = placesInDay.filter(p => p.isBackup);

  const hotels = useFirestoreQuery<Hotel>(tripId, 'hotels', 'sortOrder');
  const flights = useFirestoreQuery<Flight>(tripId, 'flights', 'sortOrder');

  const isFirstDay = days.length > 0 && days[0].id === dayId;
  const isLastDay = days.length > 0 && days[days.length - 1].id === dayId;
  const arrivalFlight = isFirstDay && flights?.length ? flights[0] : undefined;
  const departureFlight = isLastDay && flights?.length ? flights[flights.length - 1] : undefined;

  const arrivalAirportCoords = useGeocode(arrivalFlight?.arrivalAirport ? arrivalFlight.arrivalAirport + ' airport' : '');
  const departureAirportCoords = useGeocode(departureFlight?.departureAirport ? departureFlight.departureAirport + ' airport' : '');

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
    if (!tripId || !dayId) return;
    const list = isBackup ? backupPlaces : places;
    await addDoc(collection(firestore, 'trips', String(tripId), 'places'), {
      dayId: String(dayId), tripId: String(tripId), name: '', sortOrder: list.length, travelMode: 'TRANSIT', isBackup,
    });
  };

  const promoteBackup = async (placeId: string) => {
    if (!tripId || !placeId) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(placeId)), { isBackup: false, sortOrder: places.length });
  };

  const handleDragStart = useCallback((event: DragStartEvent) => setActiveDragId(event.active.id as string), []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
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
  }, [allPlaces, places, backupPlaces, tripId]);

  if (!day) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <span className="section-title" style={{ margin: 0 }}>Day {day.dayNumber}</span>
          <InlineEdit value={day.date} onSave={(v) => updateDoc(doc(firestore, 'trips', String(tripId), 'days', String(day.id!)), { date: v })} placeholder="設定日期" className="badge" />
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => addPlace()} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>
          <button className="btn btn-danger" onClick={onDeleteDay} style={{ fontSize: '0.8rem' }}>🗑️ 刪除</button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <DroppableZone id="droppable-itinerary" isOver={activeDragPlace?.isBackup}>
          {places && places.length > 0 ? (
            <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
              {places.map((place, index) => (
                <div key={place.id}><SortablePlaceCard place={place} index={index} days={days} tripId={tripId} /></div>
              ))}
            </SortableContext>
          ) : (
            <div className="empty-state"><p>還沒有景點，新增你的第一個站吧！</p></div>
          )}
        </DroppableZone>

        <div style={{ marginTop: 'var(--sp-lg)', borderTop: '2px dashed var(--border)', paddingTop: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)' }}>
            <span className="section-title" style={{ margin: 0, fontSize: '0.9rem' }}>🔸 每日備案</span>
            <button className="btn btn-secondary" onClick={() => addPlace(true)} style={{ fontSize: '0.75rem' }}>＋ 新增備案</button>
          </div>
          <DroppableZone id="droppable-backup" isOver={activeDragPlace != null && !activeDragPlace.isBackup}>
            {backupPlaces && backupPlaces.length > 0 ? (
              <SortableContext items={backupPlaces.map(p => p.id!)} strategy={verticalListSortingStrategy}>
                {backupPlaces.map((place, index) => (
                  <div key={place.id}><SortablePlaceCard place={place} index={index} days={days} tripId={tripId} onPromote={() => promoteBackup(place.id!)} isBackup /></div>
                ))}
              </SortableContext>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--sp-md)' }}><p style={{ fontSize: '0.85rem' }}>備案景點會顯示在地圖上，方便臨時調整行程。</p></div>
            )}
          </DroppableZone>
        </div>

        <DragOverlay>
          {activeDragPlace ? <div style={{ opacity: 0.85, transform: 'scale(1.02)' }}><PlaceCard place={activeDragPlace} index={0} days={days} tripId={tripId} dragHandleProps={{}} /></div> : null}
        </DragOverlay>
      </DndContext>
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

function SortablePlaceCard({ place, index, days, tripId, onPromote, isBackup }: { place: Place; index: number; days: Day[]; tripId: string; onPromote?: () => void; isBackup?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined };
  return <div ref={setNodeRef} style={style}><PlaceCard place={place} index={index} days={days} tripId={tripId} dragHandleProps={{ ...attributes, ...listeners }} onPromote={onPromote} isBackup={isBackup} /></div>;
}

function PlaceCard({ place, index, days, tripId, dragHandleProps, onPromote, isBackup }: { place: Place; index: number; days: Day[]; tripId: string; dragHandleProps: Record<string, unknown>; onPromote?: () => void; isBackup?: boolean }) {
  const notes = useFirestoreQuery<Note>(tripId, 'notes', 'sortOrder')?.filter(n => n.placeId === place.id);

  const updatePlace = async (updates: Partial<Place>) => {
    if (!tripId || !place.id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'places', String(place.id!)), updates);
  };

  const deletePlace = async () => {
    if (!confirm('確定刪除此景點嗎？') || !tripId || !place.id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'places', String(place.id!)));
  };

  const addNote = async (type: 'text' | 'url') => {
    if (!tripId || !place.id) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'notes'), {
      placeId: String(place.id), type, content: '', url: type === 'url' ? '' : null, sortOrder: notes?.length ?? 0,
    });
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
        <div className="drag-handle" {...dragHandleProps}>⠿</div>
        <EmojiPicker value={place.icon} fallback={numEmoji(index)} onSelect={(emoji) => updatePlace({ icon: emoji })} />
        <div style={{ flex: 1 }}>
          <PlaceAutocomplete value={place.name} onSelect={(r) => updatePlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, placeLink: r.placeLink })} placeholder="搜尋地點..." />
          {place.address && <div style={{ marginTop: 'var(--sp-xs)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>📍 {place.address}</div>}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-xs)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <InlineEdit value={place.amount != null ? `${place.amount}` : ''} onSave={(v) => updatePlace({ amount: parseFloat(v) || undefined })} placeholder="💰 金額" />
            <InlineEdit value={place.currency || ''} onSave={(v) => updatePlace({ currency: v })} placeholder="幣別 (TWD)" />
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
          </div>
          {notes?.map(note => (
            <div key={note.id} style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'flex-start', marginTop: 'var(--sp-xs)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{note.type === 'url' ? '🔗' : '📝'}</span>
              {note.type === 'url' ? (
                <InlineEdit value={note.url || note.content} onSave={(v) => updateDoc(doc(firestore, 'trips', String(tripId), 'notes', String(note.id!)), { url: v, content: v })} placeholder="https://..." />
              ) : (
                <InlineEdit value={note.content} onSave={(v) => updateDoc(doc(firestore, 'trips', String(tripId), 'notes', String(note.id!)), { content: v })} placeholder="備註..." multiline />
              )}
              <button className="btn-icon" style={{ fontSize: '0.7rem', width: 24, height: 24, color: 'var(--text-muted)' }} onClick={() => deleteDoc(doc(firestore, 'trips', String(tripId), 'notes', String(note.id!)))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 'var(--sp-xs)', marginTop: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            {isBackup && onPromote && <button className="btn btn-primary" onClick={onPromote} style={{ fontSize: '0.75rem' }}>➕ 加入行程</button>}
            <button className="btn btn-secondary" onClick={() => addNote('text')} style={{ fontSize: '0.75rem' }}>📝 備註</button>
            <button className="btn btn-secondary" onClick={() => addNote('url')} style={{ fontSize: '0.75rem' }}>🔗 連結</button>
          </div>
        </div>
        <button className="btn-icon btn-danger" onClick={deletePlace} style={{ fontSize: '0.7rem' }}>🗑️</button>
      </div>
    </div>
  );
}