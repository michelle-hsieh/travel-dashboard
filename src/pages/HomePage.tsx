import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { Trip, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { FirestoreTripInfo, useFirestoreTrips } from '../hooks/useFirestoreSync';
import { normalizeEmail } from '../utils/emails';

interface HomePageProps {
  onSelectTrip: (firebaseId: string) => void;
  activeTripId: string | null;
  role: Role;
}

export default function HomePage({ onSelectTrip, activeTripId, role }: HomePageProps) {
  const { user } = useAuth();
  const isAnonGuest = role === 'guest' && !user;
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const { trips: firestoreTrips, loading } = useFirestoreTrips(user?.email ?? null);

  const createTrip = async () => {
    if (!newName.trim() || !user) return;
    const newTrip = {
      name: newName.trim(),
      startDate: newStart,
      endDate: newEnd,
      createdAt: Date.now(),
      adminUid: user.uid,
      adminEmail: user.email?.toLowerCase(),
      collaborators: {},
      collaboratorEmails: [],
      memberEmails: [],
      daysCount: 0,
      placesCount: 0,
    };
    try {
      const docRef = await addDoc(collection(firestore, 'trips'), newTrip);
      setShowCreate(false);
      setNewName('');
      setNewStart('');
      setNewEnd('');
      onSelectTrip(docRef.id);
    } catch (error) {
      console.error('建立行程失敗:', error);
      alert('建立行程失敗，請檢查網路連線。');
    }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('確定要刪除此行程嗎？這會刪除雲端上的所有資料！')) return;
    try {
      const subcollections = ['days', 'places', 'notes', 'attachments', 'flights', 'hotels', 'tickets', 'checklistItems', 'budgetItems', 'resources'];
      for (const sub of subcollections) {
        const subRef = collection(firestore, 'trips', id, sub);
        const snap = await getDocs(subRef);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      }
      await deleteDoc(doc(firestore, 'trips', id));
      if (activeTripId === id) onSelectTrip('');
    } catch (error) {
      console.error('刪除失敗:', error);
      alert('刪除失敗，請確認您有權限。');
    }
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    try {
      await updateDoc(doc(firestore, 'trips', id), updates);
    } catch (error) {
      console.error('更新名稱失敗:', error);
    }
  };

  const userEmailNorm = user?.email ? normalizeEmail(user.email) : '';
  const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').toLowerCase().trim();
  const isGlobalAdmin = userEmailNorm === normalizeEmail(ADMIN_EMAIL);

  return (
    <div>
      <div className="page-header">
        <h1>我的行程 🌍</h1>
        {isGlobalAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ 新增行程</button>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>新增行程</h2>
            <div className="form-group"><label>行程名稱</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 2026 京都賞櫻" autoFocus onKeyDown={e => e.key === 'Enter' && createTrip()}/></div>
            <div className="form-row">
              <div className="form-group"><label>開始日期</label><input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} /></div>
              <div className="form-group"><label>結束日期</label><input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={createTrip}>建立</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">⏳ 載入雲端行程中...</div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          {firestoreTrips.map((tripInfo) => {
            const isOwner = user?.uid === tripInfo.adminUid || 
                           (tripInfo.adminEmail && normalizeEmail(tripInfo.adminEmail) === userEmailNorm);
            const isCollaborator = !!(tripInfo.collaboratorEmails?.includes(userEmailNorm) || 
                                     tripInfo.memberEmails?.includes(userEmailNorm));
            
            // ✅ 如果有設定全體預設權限 (只要有一項不是 none)，也允許進入
            const pub = tripInfo.publicPermissions;
            const hasPublicAccess = pub && typeof pub === 'object' && 
                                   Object.values(pub).some(v => v !== 'none');

            const canAccess = !!(isGlobalAdmin || isOwner || isCollaborator || hasPublicAccess);

            return (
              <TripCard
                key={tripInfo.firestoreId}
                trip={tripInfo}
                isActive={tripInfo.firestoreId === activeTripId}
                isGuest={!user}
                canAccess={canAccess}
                onSelect={() => onSelectTrip(tripInfo.firestoreId)}
                onDelete={() => deleteTrip(tripInfo.firestoreId)}
                onUpdate={(updates: any) => updateTrip(tripInfo.firestoreId, updates)}
                isOwner={isOwner}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip, isActive, isGuest, canAccess, onSelect, onDelete, onUpdate, isOwner }: any) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trip.name);

  const saveName = () => {
    if (name.trim() && name.trim() !== trip.name) onUpdate({ name: name.trim() });
    setEditing(false);
  };

  const disabled = !canAccess;

  const handleClick = () => {
    if (!disabled) {
      onSelect();
    }
  };

  return (
    <div
      className="card"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderColor: isActive ? 'var(--accent)' : undefined,
        opacity: disabled ? 0.7 : 1,
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {editing && !isGuest ? (
            <input value={name} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} autoFocus onClick={e => e.stopPropagation()}/>
          ) : (
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {!canAccess && <span style={{ marginRight: 8 }}>🔒</span>}
              {trip.name}
            </h3>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            📅 {trip.startDate} ~ {trip.endDate}
          </div>
          {!canAccess && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>被授權後可查看詳情</div>}
        </div>
        {!isGuest && (
          <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
            {isActive && <span className="badge">目前選取</span>}
            {isOwner && <button className="btn-icon btn-danger" onClick={onDelete}>🗑️</button>}
          </div>
        )}
      </div>
    </div>
  );
}
