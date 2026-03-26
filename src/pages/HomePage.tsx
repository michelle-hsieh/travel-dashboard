import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { exportTrip, exportAllTrips, importTrips, downloadJSON } from '../utils/export';
import type { Trip } from '../types';

interface HomePageProps {
  onSelectTrip: (tripId: number) => void;
  activeTripId: number | null;
}

export default function HomePage({ onSelectTrip, activeTripId }: HomePageProps) {
  const trips = useLiveQuery(() => db.trips.orderBy('createdAt').reverse().toArray());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const createTrip = async () => {
    if (!newName.trim()) return;
    const id = await db.trips.add({
      name: newName.trim(),
      startDate: newStart,
      endDate: newEnd,
      createdAt: Date.now(),
    });
    setShowCreate(false);
    setNewName('');
    setNewStart('');
    setNewEnd('');
    onSelectTrip(id as number);
  };

  const deleteTrip = async (id: number) => {
    if (!confirm('確定要刪除這趟旅程及所有資料嗎？')) return;
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

  return (
    <div>
      <div className="page-header">
        <h1>我的旅程 ✈️</h1>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleImport}>📥 匯入</button>
          {trips && trips.length > 0 && (
            <button className="btn btn-secondary" onClick={handleExportAll}>📤 匯出全部</button>
          )}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ 新增旅程</button>
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>建立新旅程</h2>
            <div className="form-group">
              <label>旅程名稱</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. 2026 日本櫻花季"
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

      {!trips || trips.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>🌍</p>
          <p>還沒有旅程，建立你的第一趟冒險吧！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          {trips.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              isActive={trip.id === activeTripId}
              onSelect={() => onSelectTrip(trip.id!)}
              onDelete={() => deleteTrip(trip.id!)}
              onExport={() => handleExport(trip.id!)}
              onUpdate={(updates) => updateTrip(trip.id!, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({
  trip,
  isActive,
  onSelect,
  onDelete,
  onExport,
  onUpdate,
}: {
  trip: Trip;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onExport: () => void;
  onUpdate: (updates: Partial<Trip>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trip.name);
  const days = useLiveQuery(() => db.days.where('tripId').equals(trip.id!).count(), [trip.id]);
  const places = useLiveQuery(() => db.places.where('tripId').equals(trip.id!).count(), [trip.id]);

  const saveName = () => {
    if (name.trim() && name.trim() !== trip.name) {
      onUpdate({ name: name.trim() });
    }
    setEditing(false);
  };

  return (
    <div
      className="card"
      style={{
        cursor: 'pointer',
        borderColor: isActive ? 'var(--accent)' : undefined,
        boxShadow: isActive ? 'var(--shadow-glow)' : undefined,
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {editing ? (
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
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
              {trip.name}
            </h3>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
            {trip.startDate && <span>📅 {trip.startDate} → {trip.endDate}</span>}
            <span>📍 {places ?? 0} 個景點</span>
            <span>🗓️ {days ?? 0} 天</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-xs)' }} onClick={e => e.stopPropagation()}>
          {isActive && <span className="badge">使用中</span>}
          <button className="btn-icon btn-secondary" onClick={onExport} title="匯出">📤</button>
          <button className="btn-icon btn-danger" onClick={onDelete} title="刪除">🗑️</button>
        </div>
      </div>
    </div>
  );
}
