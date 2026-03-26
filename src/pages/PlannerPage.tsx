import { useState, useEffect, useCallback } from 'react';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import InlineEdit from '../components/shared/InlineEdit';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import FileUpload from '../components/shared/FileUpload';
import AttachmentList from '../components/shared/AttachmentList';
import RouteMap from '../components/shared/RouteMap';
import EmojiPicker from '../components/shared/EmojiPicker';
import type { Place, Day, Hotel, Flight } from '../types';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const NUM_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function numEmoji(i: number) { return NUM_EMOJIS[i] ?? `${i + 1}`; }

interface PlannerPageProps {
  tripId: number;
}

// Special dayId for unassigned places (pool / 待排)
const POOL_DAY_ID = 0;

export default function PlannerPage({ tripId }: PlannerPageProps) {
  const days = useLiveQuery(
    () => db.days.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );
  // 'pool' = 待排, number = specific day id
  const [selectedTab, setSelectedTab] = useState<'pool' | number | null>(null);

  // Pool places count
  const poolCount = useLiveQuery(
    () => db.places.where('dayId').equals(POOL_DAY_ID).filter(p => p.tripId === tripId).count(),
    [tripId]
  );

  // Auto-select first day if nothing selected
  const activeTab = selectedTab ?? (days && days.length > 0 ? days[0].id! : null);

  const addDay = async () => {
    const count = days?.length ?? 0;
    const trip = await db.trips.get(tripId);
    let date = '';
    if (trip?.startDate) {
      const start = new Date(trip.startDate);
      start.setDate(start.getDate() + count);
      date = start.toISOString().split('T')[0];
    }
    await db.days.add({
      tripId,
      date,
      dayNumber: count + 1,
      sortOrder: count,
    });
  };

  const deleteDay = async (dayId: number) => {
    if (!confirm('確定刪除這天及所有景點嗎？')) return;
    const placeIds = (await db.places.where('dayId').equals(dayId).toArray()).map(p => p.id!);
    await db.notes.where('placeId').anyOf(placeIds).delete();
    await db.attachments.filter(a => a.parentType === 'place' && placeIds.includes(a.parentId)).delete();
    await db.places.where('dayId').equals(dayId).delete();
    await db.days.delete(dayId);
    if (selectedTab === dayId) setSelectedTab(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>每日行程 🗓️</h1>
        <button className="btn btn-primary" onClick={addDay}>＋ 新增天數</button>
      </div>

      {/* Day chips */}
      <div className="chip-bar">
        <button
          className={`chip ${activeTab === 'pool' ? 'active' : ''}`}
          onClick={() => setSelectedTab('pool')}
          style={{ position: 'relative' }}
        >
          📋 待排
          {(poolCount ?? 0) > 0 && (
            <span style={{
              marginLeft: 4,
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '50%',
              width: 18,
              height: 18,
              fontSize: '0.65rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>{poolCount}</span>
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
        <PoolSection tripId={tripId} days={days ?? []} />
      ) : activeTab != null ? (
        <DayDetail dayId={activeTab} tripId={tripId} days={days ?? []} onDeleteDay={() => deleteDay(activeTab)} />
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>📅</p>
          <p>還沒有天數，新增天數開始規劃吧！</p>
        </div>
      )}
    </div>
  );
}

/* ===================== POOL (待排) ===================== */
function PoolSection({ tripId, days }: { tripId: number; days: Day[] }) {
  const places = useLiveQuery(
    () => db.places.where('dayId').equals(POOL_DAY_ID).filter(p => p.tripId === tripId).sortBy('sortOrder'),
    [tripId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const addPlace = async () => {
    const count = places?.length ?? 0;
    await db.places.add({
      dayId: POOL_DAY_ID,
      tripId,
      name: '',
      sortOrder: count,
      travelMode: 'TRANSIT',
    });
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !places) return;
      const oldIndex = places.findIndex(p => p.id === active.id);
      const newIndex = places.findIndex(p => p.id === over.id);
      const reordered = arrayMove(places, oldIndex, newIndex);
      await Promise.all(
        reordered.map((p, i) => db.places.update(p.id!, { sortOrder: i }))
      );
    },
    [places]
  );

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useState(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });

  const allMapPoints: { name: string; lat: number; lng: number; label?: string }[] = [];
  const placesWithCoords = places?.filter(p => p.lat && p.lng) ?? [];
  placesWithCoords.forEach((p, i) => allMapPoints.push({ name: p.name, lat: p.lat!, lng: p.lng!, label: p.icon || numEmoji(i) }));

  return (
    <div>
      {/* Map */}
      <div className="map-container" style={allMapPoints.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-muted)' } : undefined}>
        {allMapPoints.length > 0 && isOnline ? (
          <RouteMap places={allMapPoints} />
        ) : (
          <span>
            {!isOnline ? '📡 離線中 — 無法顯示地圖' : '🗺️ 新增有地標的景點以顯示地圖'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
        <span className="section-title" style={{ margin: 0 }}>📋 待排景點</span>
        <button className="btn btn-primary" onClick={addPlace} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>
      </div>

      {places && places.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
            {places.map((place, index) => (
              <div key={place.id}>
                <SortablePlaceCard place={place} index={index} days={days} />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <div className="empty-state">
          <p>想去但還沒排進行程的景點可以先放這裡！</p>
        </div>
      )}
    </div>
  );
}

/* ===================== DAY DETAIL ===================== */
function DayDetail({ dayId, tripId, days, onDeleteDay }: { dayId: number; tripId: number; days: Day[]; onDeleteDay: () => void }) {
  const day = useLiveQuery(() => db.days.get(dayId), [dayId]);
  const allPlaces = useLiveQuery(
    () => db.places.where('dayId').equals(dayId).sortBy('sortOrder'),
    [dayId]
  );
  const places = allPlaces?.filter(p => !p.isBackup);
  const backupPlaces = allPlaces?.filter(p => p.isBackup);
  const hotels = useLiveQuery(
    () => db.hotels.where('tripId').equals(tripId).toArray(),
    [tripId]
  );
  const flights = useLiveQuery(
    () => db.flights.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );
  const allDays = useLiveQuery(
    () => db.days.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );
  // Compute flights for first/last day (hooks must be called unconditionally)
  const isFirstDay = allDays && allDays.length > 0 && allDays[0].id === dayId;
  const isLastDay = allDays && allDays.length > 0 && allDays[allDays.length - 1].id === dayId;
  const arrivalFlight = isFirstDay && flights?.length ? flights[0] : undefined;
  const departureFlight = isLastDay && flights?.length ? flights[flights.length - 1] : undefined;

  const arrivalAirportCoords = useGeocode(arrivalFlight?.arrivalAirport ? arrivalFlight.arrivalAirport + ' airport' : '');
  const departureAirportCoords = useGeocode(departureFlight?.departureAirport ? departureFlight.departureAirport + ' airport' : '');
  // For Google Maps links when geocode hasn't resolved yet
  const arrivalAirportName = arrivalFlight?.arrivalAirport || '';
  const departureAirportName = departureFlight?.departureAirport || '';

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useState(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const activeDragPlace = allPlaces?.find(p => p.id === activeDragId) ?? null;

  const addPlace = async (isBackup = false) => {
    const list = isBackup ? backupPlaces : places;
    const count = list?.length ?? 0;
    await db.places.add({
      dayId,
      tripId,
      name: '',
      sortOrder: count,
      travelMode: 'TRANSIT',
      isBackup,
    });
  };

  const promoteBackup = async (placeId: number) => {
    const count = places?.length ?? 0;
    await db.places.update(placeId, { isBackup: false, sortOrder: count });
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || !allPlaces) return;

      const draggedPlace = allPlaces.find(p => p.id === active.id);
      if (!draggedPlace) return;

      const overId = over.id;

      // Dropped on a droppable zone (not on another sortable item)
      if (overId === 'droppable-itinerary') {
        if (draggedPlace.isBackup) {
          const count = places?.length ?? 0;
          await db.places.update(draggedPlace.id!, { isBackup: false, sortOrder: count });
        }
        return;
      }
      if (overId === 'droppable-backup') {
        if (!draggedPlace.isBackup) {
          const count = backupPlaces?.length ?? 0;
          await db.places.update(draggedPlace.id!, { isBackup: true, sortOrder: count });
        }
        return;
      }

      // Dropped on another sortable item
      const overPlace = allPlaces.find(p => p.id === overId);
      if (!overPlace) return;

      const fromBackup = !!draggedPlace.isBackup;
      const toBackup = !!overPlace.isBackup;

      if (fromBackup === toBackup) {
        // Same zone: reorder
        const list = fromBackup ? backupPlaces : places;
        if (!list) return;
        const oldIndex = list.findIndex(p => p.id === active.id);
        const newIndex = list.findIndex(p => p.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(list, oldIndex, newIndex);
        await Promise.all(
          reordered.map((p, i) => db.places.update(p.id!, { sortOrder: i }))
        );
      } else {
        // Cross-zone: move item to the other zone at the drop position
        const targetList = toBackup ? [...(backupPlaces ?? [])] : [...(places ?? [])];
        const dropIndex = targetList.findIndex(p => p.id === overId);
        await db.places.update(draggedPlace.id!, { isBackup: toBackup, sortOrder: dropIndex });
        // Re-index the target list
        targetList.splice(dropIndex, 0, draggedPlace);
        await Promise.all(
          targetList.map((p, i) => db.places.update(p.id!, { sortOrder: i }))
        );
        // Re-index the source list
        const sourceList = fromBackup ? (backupPlaces ?? []).filter(p => p.id !== draggedPlace.id) : (places ?? []).filter(p => p.id !== draggedPlace.id);
        await Promise.all(
          sourceList.map((p, i) => db.places.update(p.id!, { sortOrder: i }))
        );
      }
    },
    [allPlaces, places, backupPlaces]
  );

  if (!day) return null;

  // Find hotels for this day
  // stayingHotel: hotel where checkIn <= date < checkOut (you're staying here tonight)
  // checkoutHotel: hotel where checkOut == date (you're checking out today, depart from here)
  const stayingHotel = day.date && hotels
    ? hotels.find(h => h.checkIn && h.checkOut && day.date! >= h.checkIn && day.date! < h.checkOut)
    : undefined;
  const checkoutHotel = day.date && hotels
    ? hotels.find(h => h.checkIn && h.checkOut && h.checkOut === day.date && h.checkIn < day.date!)
    : undefined;

  // departHotel: where you start the day (checkout hotel takes priority, else staying hotel)
  // returnHotel: where you end the day (staying hotel, or a new hotel checking in today)
  const departHotel = checkoutHotel || stayingHotel;
  const returnHotel = stayingHotel;
  const departLabel = departHotel && departHotel !== returnHotel ? '退房' : '出發';
  const returnLabel = returnHotel && returnHotel !== departHotel ? '入住' : '回飯店';

  // Build map points for the route map
  const allMapPoints: { name: string; lat: number; lng: number; label?: string }[] = [];
  if (arrivalAirportCoords) allMapPoints.push({ name: `✈️ ${arrivalAirportName}`, lat: arrivalAirportCoords.lat, lng: arrivalAirportCoords.lng, label: '✈️' });
  if (departHotel?.lat && departHotel?.lng) allMapPoints.push({ name: `🏨 ${departHotel.name}`, lat: departHotel.lat, lng: departHotel.lng, label: '🏨' });
  const placesWithCoords = places?.filter(p => p.lat && p.lng) ?? [];
  placesWithCoords.forEach((p, i) => allMapPoints.push({ name: p.name, lat: p.lat!, lng: p.lng!, label: p.icon || numEmoji(i) }));
  // Backup places on map with their icon or 🔸
  const backupWithCoords = backupPlaces?.filter(p => p.lat && p.lng) ?? [];
  backupWithCoords.forEach(p => allMapPoints.push({ name: `(備案) ${p.name}`, lat: p.lat!, lng: p.lng!, label: p.icon || '🔸' }));
  if (returnHotel?.lat && returnHotel?.lng) allMapPoints.push({ name: `🏨 ${returnHotel.name}`, lat: returnHotel.lat, lng: returnHotel.lng, label: '🏨' });
  if (departureAirportCoords) allMapPoints.push({ name: `✈️ ${departureAirportName}`, lat: departureAirportCoords.lat, lng: departureAirportCoords.lng, label: '✈️' });

  const firstPlace = places?.[0];
  const lastPlace = places?.[places.length - 1];

  return (
    <div>
      {/* Map */}
      <div className="map-container" style={allMapPoints.length === 0 ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-muted)' } : undefined}>
        {allMapPoints.length > 0 && isOnline ? (
          <RouteMap places={allMapPoints} />
        ) : (
          <span>
            {!isOnline ? '📡 離線中 — 無法顯示地圖' : '🗺️ 新增景點以顯示地圖'}
          </span>
        )}
      </div>

      {/* Day info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <span className="section-title" style={{ margin: 0 }}>Day {day.dayNumber}</span>
          <InlineEdit
            value={day.date}
            onSave={(v) => db.days.update(day.id!, { date: v })}
            placeholder="設定日期"
            className="badge"
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => addPlace()} style={{ fontSize: '0.8rem' }}>＋ 新增景點</button>
          <button className="btn btn-danger" onClick={onDeleteDay} style={{ fontSize: '0.8rem' }}>🗑️ 刪除</button>
        </div>
      </div>

      {/* Start: Airport (first day) → transit → Hotel(Depart) → transit → First Place */}
      {arrivalFlight?.arrivalAirport && (
        <>
          <AirportBadge
            airportName={arrivalFlight.arrivalAirport}
            label={`抵達 — ${arrivalFlight.airline} ${arrivalFlight.flightNo}`}
            time={arrivalFlight.arrivalTime}
            coords={arrivalAirportCoords}
          />
          {departHotel?.name && (
            <DirectionsLink fromText={arrivalAirportName + ' airport'} toText={departHotel.name} fromCoords={arrivalAirportCoords} toCoords={departHotel.lat != null && departHotel.lng != null ? { lat: departHotel.lat, lng: departHotel.lng } : null} />
          )}
          {!departHotel && firstPlace?.name && (
            <DirectionsLink fromText={arrivalAirportName + ' airport'} toText={firstPlace.name} fromCoords={arrivalAirportCoords} toCoords={firstPlace.lat != null && firstPlace.lng != null ? { lat: firstPlace.lat, lng: firstPlace.lng } : null} />
          )}
        </>
      )}
      {departHotel && (
        <>
          <HotelBadge hotel={departHotel} label={departLabel} />
          {departHotel.lat && departHotel.lng && firstPlace?.lat && firstPlace?.lng && (
            <TransitLink from={{ lat: departHotel.lat, lng: departHotel.lng, travelMode: 'TRANSIT' }} to={firstPlace} />
          )}
        </>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Places */}
      <DroppableZone id="droppable-itinerary" isOver={activeDragPlace?.isBackup}>
      {places && places.length > 0 ? (
          <SortableContext items={places.map(p => p.id!)} strategy={verticalListSortingStrategy}>
            {places.map((place, index) => (
              <div key={place.id}>
                <SortablePlaceCard place={place} index={index} days={days} />
                {index < places.length - 1 && place.lat && place.lng && places[index + 1].lat && places[index + 1].lng && (
                  <TransitLink from={place} to={places[index + 1]} />
                )}
              </div>
            ))}
          </SortableContext>
      ) : (
        <div className="empty-state">
          <p>還沒有景點，新增你的第一個站吧！</p>
        </div>
      )}
      </DroppableZone>

      {/* End: Last Place → transit → Hotel(Return/Check-in) → transit → Airport (last day) */}
      {!departureFlight?.departureAirport && returnHotel && (
        <>
          {returnHotel.lat && returnHotel.lng && lastPlace?.lat && lastPlace?.lng && (
            <TransitLink from={lastPlace} to={{ lat: returnHotel.lat, lng: returnHotel.lng, travelMode: 'TRANSIT' }} />
          )}
          <HotelBadge hotel={returnHotel} label={returnLabel} />
        </>
      )}
      {departureFlight?.departureAirport && (
        <>
          {departHotel && departHotel.lat && departHotel.lng && lastPlace?.lat && lastPlace?.lng && (
            <>
              <TransitLink from={lastPlace} to={{ lat: departHotel.lat, lng: departHotel.lng, travelMode: 'TRANSIT' }} />
              <HotelBadge hotel={departHotel} label="退房" />
            </>
          )}
          {departHotel?.name && (
            <DirectionsLink fromText={departHotel.name} toText={departureAirportName + ' airport'} fromCoords={departHotel.lat != null && departHotel.lng != null ? { lat: departHotel.lat, lng: departHotel.lng } : null} toCoords={departureAirportCoords} />
          )}
          {!departHotel && lastPlace?.name && (
            <DirectionsLink fromText={lastPlace.name} toText={departureAirportName + ' airport'} fromCoords={lastPlace.lat != null && lastPlace.lng != null ? { lat: lastPlace.lat, lng: lastPlace.lng } : null} toCoords={departureAirportCoords} />
          )}
          <AirportBadge
            airportName={departureFlight.departureAirport}
            label={`出發 — ${departureFlight.airline} ${departureFlight.flightNo}`}
            time={departureFlight.departureTime}
            coords={departureAirportCoords}
          />
        </>
      )}

      {/* Backup section (每日備案) — separated from itinerary */}
      <div style={{ marginTop: 'var(--sp-lg)', borderTop: '2px dashed var(--border)', paddingTop: 'var(--sp-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
          <span className="section-title" style={{ margin: 0, fontSize: '0.9rem' }}>🔸 每日備案</span>
          <button className="btn btn-secondary" onClick={() => addPlace(true)} style={{ fontSize: '0.75rem' }}>＋ 新增備案</button>
        </div>
        <DroppableZone id="droppable-backup" isOver={activeDragPlace != null && !activeDragPlace.isBackup}>
        {backupPlaces && backupPlaces.length > 0 ? (
            <SortableContext items={backupPlaces.map(p => p.id!)} strategy={verticalListSortingStrategy}>
              {backupPlaces.map((place, index) => (
                <div key={place.id}>
                  <SortablePlaceCard place={place} index={index} days={days} onPromote={() => promoteBackup(place.id!)} isBackup />
                </div>
              ))}
            </SortableContext>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--sp-md)' }}>
            <p style={{ fontSize: '0.85rem' }}>備案景點會顯示在地圖上，方便臨時調整行程。</p>
          </div>
        )}
        </DroppableZone>
      </div>

      <DragOverlay>
        {activeDragPlace ? (
          <div style={{ opacity: 0.85, transform: 'scale(1.02)' }}>
            <PlaceCard place={activeDragPlace} index={0} days={days} dragHandleProps={{}} />
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}

function useGeocode(query: string) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!query) return;
    const provider = new OpenStreetMapProvider({
      params: {
        'accept-language': 'zh-TW,ja,en',
        countrycodes: 'jp,tw',
        limit: 1
      }
    });
    provider.search({ query })
      .then((res: any) => {
        if (res && res[0]) {
          setCoords({ lat: res[0].y, lng: res[0].x });
        }
      })
      .catch(() => {});
  }, [query]);
  return coords;
}

function AirportBadge({ airportName, label, time, coords }: {
  airportName: string;
  label: string;
  time?: string;
  coords: { lat: number; lng: number } | null;
}) {
  return (
    <div className="card" style={{
      marginBottom: 'var(--sp-sm)',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-sm)',
      background: 'var(--bg-card)',
      border: '1px dashed var(--border)',
      opacity: 0.85,
    }}>
      <span style={{ fontSize: '1.1rem' }}>✈️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {airportName}{time ? ` · ${time}` : ''}
        </div>
      </div>
      {coords && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '0.75rem', color: 'var(--accent-light)' }}>
          🔗 Map
        </a>
      )}
    </div>
  );
}

function HotelBadge({ hotel, label }: { hotel: Hotel; label: string }) {
  return (
    <div className="card" style={{
      marginBottom: 'var(--sp-sm)',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-sm)',
      background: 'var(--bg-card)',
      border: '1px dashed var(--border)',
      opacity: 0.85,
    }}>
      <span style={{ fontSize: '1.1rem' }}>🏨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {label} — {hotel.name || '飯店'}
        </div>
        {hotel.address && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📍 {hotel.address}</div>
        )}
      </div>
      {hotel.placeLink && (
        <a href={hotel.placeLink} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '0.75rem', color: 'var(--accent-light)' }}>
          🔗 Map
        </a>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

interface TransitPoint {
  lat?: number;
  lng?: number;
  travelMode?: string;
}

function TransitLink({ from, to }: { from: TransitPoint; to: TransitPoint }) {
  const travelMode = from.travelMode || 'TRANSIT';
  const modeMap: Record<string, { icon: string; gmapsMode: string; osrmProfile: string }> = {
    WALKING: { icon: '🚶', gmapsMode: 'walking', osrmProfile: 'foot' },
    TRANSIT: { icon: '🚇', gmapsMode: 'transit', osrmProfile: 'car' },
    DRIVING: { icon: '🚗', gmapsMode: 'driving', osrmProfile: 'car' },
  };
  const mode = modeMap[travelMode] || modeMap.TRANSIT;
  const url = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=${mode.gmapsMode}`;

  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    setDuration(null);
    if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return;
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    fetch(`https://router.project-osrm.org/route/v1/${mode.osrmProfile}/${coords}?overview=false`)
      .then(res => res.json())
      .then(data => {
        if (data.routes?.[0]?.duration != null) {
          setDuration(data.routes[0].duration);
        }
      })
      .catch(() => {});
  }, [from.lat, from.lng, to.lat, to.lng, travelMode, mode.osrmProfile]);

  const label = duration != null
    ? `${mode.icon} ${formatDuration(duration)}`
    : `${mode.icon} ...`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--sp-sm)',
      padding: '4px 0',
      fontSize: '0.78rem',
      color: 'var(--text-muted)',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--accent-light)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </a>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function DirectionsLink({ fromText, toText, fromCoords, toCoords }: {
  fromText: string;
  toText: string;
  fromCoords?: { lat: number; lng: number } | null;
  toCoords?: { lat: number; lng: number } | null;
}) {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromText)}&destination=${encodeURIComponent(toText)}&travelmode=transit`;

  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    setDuration(null);
    if (!fromCoords || !toCoords) return;
    const coords = `${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}`;
    fetch(`https://router.project-osrm.org/route/v1/car/${coords}?overview=false`)
      .then(res => res.json())
      .then(data => {
        if (data.routes?.[0]?.duration != null) {
          setDuration(data.routes[0].duration);
        }
      })
      .catch(() => {});
  }, [fromCoords?.lat, fromCoords?.lng, toCoords?.lat, toCoords?.lng]);

  const label = duration != null
    ? `🚇 ${formatDuration(duration)}`
    : '🚇 ...';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--sp-sm)',
      padding: '4px 0',
      fontSize: '0.78rem',
      color: 'var(--text-muted)',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--accent-light)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </a>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function DroppableZone({ id, isOver, children }: { id: string; isOver?: boolean | null; children: React.ReactNode }) {
  const { setNodeRef, isOver: isOverCurrent } = useDroppable({ id });
  const highlight = isOver && isOverCurrent;
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 48,
        borderRadius: 'var(--radius)',
        border: highlight ? '2px dashed var(--accent)' : '2px dashed transparent',
        background: highlight ? 'rgba(var(--accent-rgb, 99,102,241), 0.06)' : undefined,
        transition: 'border-color 0.2s, background 0.2s',
        padding: highlight ? 'var(--sp-xs)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

function SortablePlaceCard({ place, index, days, onPromote, isBackup }: { place: Place; index: number; days: Day[]; onPromote?: () => void; isBackup?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PlaceCard place={place} index={index} days={days} dragHandleProps={{ ...attributes, ...listeners }} onPromote={onPromote} isBackup={isBackup} />
    </div>
  );
}

function PlaceCard({ place, index, days, dragHandleProps, onPromote, isBackup }: { place: Place; index: number; days: Day[]; dragHandleProps: Record<string, unknown>; onPromote?: () => void; isBackup?: boolean }) {
  const notes = useLiveQuery(
    () => db.notes.where('placeId').equals(place.id!).sortBy('sortOrder'),
    [place.id]
  );
  const updatePlace = (updates: Partial<Place>) => {
    db.places.update(place.id!, updates);
  };

  const deletePlace = async () => {
    if (!confirm('確定刪除此景點嗎？')) return;
    await db.notes.where('placeId').equals(place.id!).delete();
    await db.attachments.filter(a => a.parentType === 'place' && a.parentId === place.id!).delete();
    await db.places.delete(place.id!);
  };

  const addNote = async (type: 'text' | 'url') => {
    await db.notes.add({
      placeId: place.id!,
      type,
      content: '',
      url: type === 'url' ? '' : undefined,
      sortOrder: notes?.length ?? 0,
    });
  };

  const deleteNote = async (noteId: number) => {
    await db.notes.delete(noteId);
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
        <div className="drag-handle" {...dragHandleProps}>⠿</div>
        <EmojiPicker
          value={place.icon}
          fallback={numEmoji(index)}
          onSelect={(emoji) => updatePlace({ icon: emoji })}
        />
        <div style={{ flex: 1 }}>
          <PlaceAutocomplete
            value={place.name}
            onSelect={(r) => updatePlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, placeLink: r.placeLink })}
            placeholder="搜尋地點..."
          />

          {/* Auto-filled address */}
          {place.address && (
            <div style={{ marginTop: 'var(--sp-xs)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              📍 {place.address}
            </div>
          )}

          {/* Amount */}
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-xs)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <InlineEdit
              value={place.amount != null ? `${place.amount}` : ''}
              onSave={(v) => updatePlace({ amount: parseFloat(v) || undefined })}
              placeholder="💰 金額"
            />
            <InlineEdit
              value={place.currency || ''}
              onSave={(v) => updatePlace({ currency: v })}
              placeholder="幣別 (TWD)"
            />
            <select
              value={place.travelMode || 'TRANSIT'}
              onChange={(e) => updatePlace({ travelMode: e.target.value as Place['travelMode'] })}
              style={{ width: 'auto', fontSize: '0.75rem', padding: '2px 6px' }}
            >
              <option value="WALKING">🚶 步行</option>
              <option value="TRANSIT">🚇 大眾運輸</option>
              <option value="DRIVING">🚗 開車</option>
            </select>
            <select
              value={`${place.dayId}:${place.isBackup ? '1' : '0'}`}
              onChange={async (e) => {
                const [dayIdStr, backupStr] = e.target.value.split(':');
                const newDayId = parseInt(dayIdStr);
                const newIsBackup = backupStr === '1';
                if (newDayId === place.dayId && newIsBackup === !!place.isBackup) return;
                const targetPlaces = await db.places.where('dayId').equals(newDayId)
                  .filter(p => !!p.isBackup === newIsBackup).count();
                await db.places.update(place.id!, { dayId: newDayId, sortOrder: targetPlaces, isBackup: newIsBackup });
              }}
              style={{ width: 'auto', fontSize: '0.75rem', padding: '2px 6px' }}
            >
              <option value={`${POOL_DAY_ID}:0`}>📋 待排</option>
              {days.map(d => (
                <optgroup key={d.id} label={`Day ${d.dayNumber}${d.date ? ` · ${d.date}` : ''}`}>
                  <option value={`${d.id!}:0`}>Day {d.dayNumber} 行程</option>
                  <option value={`${d.id!}:1`}>Day {d.dayNumber} 備案</option>
                </optgroup>
              ))}
            </select>
          </div>

          {/* Notes */}
          {notes?.map(note => (
            <div key={note.id} style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'flex-start', marginTop: 'var(--sp-xs)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{note.type === 'url' ? '🔗' : '📝'}</span>
              {note.type === 'url' ? (
                <InlineEdit
                  value={note.url || note.content}
                  onSave={(v) => db.notes.update(note.id!, { url: v, content: v })}
                  placeholder="https://..."
                />
              ) : (
                <InlineEdit
                  value={note.content}
                  onSave={(v) => db.notes.update(note.id!, { content: v })}
                  placeholder="備註..."
                  multiline
                />
              )}
              <button className="btn-icon" style={{ fontSize: '0.7rem', width: 24, height: 24, color: 'var(--text-muted)' }} onClick={() => deleteNote(note.id!)}>✕</button>
            </div>
          ))}

          {/* Attachments */}
          <AttachmentList parentId={place.id!} parentType="place" />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--sp-xs)', marginTop: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            {isBackup && onPromote && (
              <button className="btn btn-primary" onClick={onPromote} style={{ fontSize: '0.75rem' }}>➕ 加入行程</button>
            )}
            <button className="btn btn-secondary" onClick={() => addNote('text')} style={{ fontSize: '0.75rem' }}>📝 備註</button>
            <button className="btn btn-secondary" onClick={() => addNote('url')} style={{ fontSize: '0.75rem' }}>🔗 連結</button>
            <FileUpload parentId={place.id!} parentType="place" />
          </div>
        </div>
        <button className="btn-icon btn-danger" onClick={deletePlace} style={{ fontSize: '0.7rem' }}>🗑️</button>
      </div>
    </div>
  );
}
