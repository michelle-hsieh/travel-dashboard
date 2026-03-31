import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { exportTrip, exportAllTrips, importTrips, downloadJSON } from '../utils/export';
import { pushTripToCloud, pullTripsFromCloud, pullPublicTripsFromCloud } from '../db/sync';
import type { Trip, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { useFirestoreTrips } from '../hooks/useFirestoreSync';

function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  const [localRaw, domainRaw = ''] = lower.split('@');
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  const localNoPlus = localRaw.split('+')[0];
  const localNoDots = domain === 'gmail.com' ? localNoPlus.replace(/\./g, '') : localNoPlus;
  return `${localNoDots}@${domain}`;
}

function collaboratorKey(email: string): string {
  return normalizeEmail(email).replace(/\./g, '_');
}

interface HomePageProps {
  onSelectTrip: (tripId: number, firebaseId?: string) => void;
  activeTripId: number | null;
  role: Role;
}

export default function HomePage({ onSelectTrip, activeTripId, role }: HomePageProps) {
  const { user, setActiveTripId: setAuthTripId } = useAuth();
  const isAnonGuest = role === 'guest' && !user;
  const trips = useLiveQuery(() => db.trips.orderBy('createdAt').reverse().toArray());
  const { trips: sharedTrips } = useFirestoreTrips(user?.email ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [publicTrips, setPublicTrips] = useState<Trip[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const pulledOnceRef = useRef(false);
  const lastSharedSignatureRef = useRef('');

  // Fetch public trips once
  useEffect(() => {
    pullPublicTripsFromCloud()
      .then(res => setPublicTrips(res))
      .catch(e => console.error(e))
      .finally(() => setLoadingPublic(false));
  }, []);

  // Auto pull trips for signed-in users (admins/members)
  useEffect(() => {
    if (!user || pulledOnceRef.current) return;
    pulledOnceRef.current = true;
    setSyncing(true);
    pullTripsFromCloud(user.uid, Object.values(user.providerData)[0]?.email || user.email || '')
      .catch(e => console.error('Auto pull trips failed:', e))
      .finally(() => setSyncing(false));
  }, [user]);

  // If admin grants/removes access while the collaborator is already logged in,
  // pull again so the local HomePage card state is refreshed.
  useEffect(() => {
    if (!user) return;
    const signature = sharedTrips
      .map((trip) => trip.firestoreId)
      .sort()
      .join('|');

    if (!signature || signature === lastSharedSignatureRef.current) return;
    lastSharedSignatureRef.current = signature;

    setSyncing(true);
    pullTripsFromCloud(user.uid, Object.values(user.providerData)[0]?.email || user.email || '')
      .catch((e) => console.error('Shared trips pull failed:', e))
      .finally(() => setSyncing(false));
  }, [sharedTrips, user]);

  // Merge local Dexie trips with public trips
  const allTrips = [...(trips || [])];
  publicTrips.forEach((pt) => {
    if (!allTrips.some((lt) => lt.firebaseId === pt.firebaseId)) {
      allTrips.push(pt);
    }
  });

  const createTrip = async () => {
    if (!newName.trim()) return;
    const id = await db.trips.add({
      name: newName.trim(),
      startDate: newStart,
      endDate: newEnd,
      createdAt: Date.now(),
      adminUid: user?.uid,
      adminEmail: user?.email?.toLowerCase(),
    });
    setShowCreate(false);
    setNewName('');
    setNewStart('');
    setNewEnd('');
    onSelectTrip(id as number);

    if (user?.uid) {
      try {
        const firebaseId = await pushTripToCloud(
          id as number,
          user.uid,
          Object.values(user.providerData)[0]?.email || ''
        );
        if (firebaseId) {
          setAuthTripId(firebaseId);
        }
      } catch (err) {
        console.error('Failed to auto-sync trip:', err);
      }
    }
  };

  const deleteTrip = async (id: number) => {
    if (!confirm('確定要刪除此行程嗎？')) return;
    await db.transaction('rw', [db.trips, db.days, db.places, db.notes, db.attachments, db.flights, db.hotels, db.tickets, db.checklistItems, db.budgetItems], async () => {
      const placeIds = (await db.places.where('tripId').equals(id).toArray()).map(p => p.id!);
      await db.notes.where('placeId').anyOf(placeIds).delete();
      await db.attachments.filter(a => (a.parentType === 'place' && placeIds.includes(a.parentId))).delete();
      await db.places.where('tripId').equals(id).delete();
      await db.days.where('tripId').equals(id).delete();
      await db.flights.where('tripId').equals(id).delete();
      await db.hotels.where('tripId').equals(id).delete();
      await db.tickets.where('tripId').equals(id).delete();
      await db.checklistItems.where('tripId').equals(id).delete();
      await db.budgetItems.where('tripId').equals(id).delete();
      await db.trips.delete(id);
    });
  };

  const handleExport = async (tripId: number) => {
    const data = await exportTrip(tripId);
    downloadJSON([data], `trip_${data.trip.name}.json`);
  };

  const handleExportAll = async () => {
    const data = await exportAllTrips();
    downloadJSON(data, 'all_trips.json');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      await importTrips(Array.isArray(data) ? data : [data]);
    };
    input.click();
  };

  const updateTrip = async (id: number, updates: Partial<Trip>) => {
    await db.trips.update(id, updates);
  };

  const handlePushCloud = async (tripId: number) => {
    if (!user) return alert('請先登入');
    setSyncing(true);
    try {
      const firebaseId = await pushTripToCloud(tripId, user.uid, Object.values(user.providerData)[0]?.email || '');
      if (firebaseId) setAuthTripId(firebaseId);
      alert('同步成功');
    } catch (err: any) {
      alert('同步失敗: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePullCloud = async () => {
    if (!user) return alert('請先登入');
    setSyncing(true);
    try {
      await pullTripsFromCloud(user.uid, Object.values(user.providerData)[0]?.email || '');
      alert('雲端資料已更新到本機');
    } catch (err: any) {
      alert('拉取失敗: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const userEmailNorm = user?.email ? normalizeEmail(user.email) : '';
  const userKey = userEmailNorm ? collaboratorKey(userEmailNorm) : '';

  return (
    <div>
      <div className="page-header">
        <h1>我的行程</h1>
        {!isAnonGuest && (
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handleImport}>匯入</button>
            {user && (
              <button className="btn btn-secondary" onClick={handlePullCloud} disabled={syncing}>
                {syncing ? '同步中...' : '從雲端拉回'}
              </button>
            )}
            {trips && trips.length > 0 && (
              <button className="btn btn-secondary" onClick={handleExportAll}>匯出全部</button>
            )}
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>新增行程</button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>新增行程</h2>
            <div className="form-group">
              <label>行程名稱</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. 2026 京都賞櫻"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createTrip()}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>開始日期</label>
                <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label>結束日期</label>
                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={createTrip}>建立</button>
            </div>
          </div>
        </div>
      )}

      {trips === undefined || loadingPublic ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', display: 'inline-block', animation: 'spin 2s linear infinite', lineHeight: 1 }}>⏳</div>
          <p>載入中...</p>
        </div>
      ) : !allTrips || allTrips.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>🤷‍♀️</p>
          <p>目前沒有行程，試著新增一個吧！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          {allTrips.map((trip, idx) => {
            let collabEntry =
              trip.collaborators?.[userKey] ?? trip.collaborators?.[userEmailNorm.replace(/\./g, '_')];
            if (!collabEntry && trip.collaborators && userEmailNorm) {
              collabEntry = Object.values(trip.collaborators).find((c: any) =>
                normalizeEmail((c as any).email) === userEmailNorm
              ) as any;
            }
            const listedAsMember = !!(
              userEmailNorm &&
              (
                trip.memberEmails?.includes(userEmailNorm) ||
                trip.collaboratorEmails?.includes(userEmailNorm)
              )
            );
            const canAccess =
              !isAnonGuest &&
              !!user &&
              (
                (trip.adminUid && trip.adminUid === user.uid) ||
                !!collabEntry ||
                listedAsMember
              );
            return (
              <TripCard
                key={trip.id ? `local-${trip.id}` : `cloud-${trip.firebaseId}-${idx}`}
                trip={trip}
                isActive={trip.id === activeTripId}
                isGuest={isAnonGuest}
                canAccess={canAccess}
                onSelect={() => onSelectTrip(trip.id!, trip.firebaseId)}
                onDelete={() => deleteTrip(trip.id!)}
                onExport={() => handleExport(trip.id!)}
                onUpdate={(updates) => updateTrip(trip.id!, updates)}
                onPushCloud={() => handlePushCloud(trip.id!)}
                isOwner={user?.uid === trip.adminUid || (!trip.adminUid && !isAnonGuest)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TripCard({
  trip,
  isActive,
  isGuest,
  canAccess,
  onSelect,
  onDelete,
  onExport,
  onUpdate,
  onPushCloud,
  isOwner,
}: {
  trip: Trip;
  isActive: boolean;
  isGuest: boolean;
  canAccess: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onExport: () => void;
  onUpdate: (updates: Partial<Trip>) => void;
  onPushCloud: () => void;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trip.name);
  const dbDays = useLiveQuery(
    () => trip.id ? db.days.where('tripId').equals(trip.id).count() : Promise.resolve(0),
    [trip.id]
  );
  const dbPlaces = useLiveQuery(
    () => trip.id ? db.places.where('tripId').equals(trip.id).count() : Promise.resolve(0),
    [trip.id]
  );

  const days = trip.id ? dbDays : trip.daysCount || 0;
  const places = trip.id ? dbPlaces : trip.placesCount || 0;

  const saveName = () => {
    if (name.trim() && name.trim() !== trip.name) {
      onUpdate({ name: name.trim() });
    }
    setEditing(false);
  };

  const disabled = !canAccess || isGuest || !trip.id;

  return (
    <div
      className="card"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderColor: isActive ? 'var(--accent)' : undefined,
        boxShadow: isActive ? 'var(--shadow-glow)' : undefined,
        opacity: disabled ? 0.7 : 1,
      }}
      onClick={disabled ? undefined : onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {editing && !isGuest ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(trip.name); setEditing(false); } }}
              autoFocus
              onClick={e => e.stopPropagation()}
              style={{ fontSize: '1.1rem', fontWeight: 600 }}
            />
          ) : (
            <h3
              style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--sp-xs)' }}
              onDoubleClick={isGuest ? undefined : (e) => { e.stopPropagation(); setEditing(true); }}
            >
              {!canAccess && <span style={{ marginRight: 'var(--sp-xs)' }}>🔒</span>}
              {trip.name}
            </h3>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            {trip.startDate && <span>📅 {trip.startDate} ~ {trip.endDate}</span>}
            <span>📍 {places ?? 0} 地點</span>
            <span>🗓️ {days ?? 0} 天</span>
          </div>
          {isGuest && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 'var(--sp-xs)' }}>
              登入或被授權後可查看詳情
            </div>
          )}
        </div>
        {!isGuest && (
          <div style={{ display: 'flex', gap: 'var(--sp-xs)' }} onClick={e => e.stopPropagation()}>
            {isActive && <span className="badge">目前選取</span>}
            {isOwner && <button className="btn-icon btn-secondary" onClick={onPushCloud} title="同步雲端">☁️</button>}
            <button className="btn-icon btn-secondary" onClick={onExport} title="匯出">⬇️</button>
            {isOwner && <button className="btn-icon btn-danger" onClick={onDelete} title="刪除">🗑️</button>}
          </div>
        )}
      </div>
    </div>
  );
}
