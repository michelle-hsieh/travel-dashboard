import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { Trip, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { FirestoreTripInfo, useFirestoreTrips } from '../hooks/useFirestoreSync';
import { normalizeEmail } from '../utils/emails';

interface HomePageProps {
  onSelectTrip: (firebaseId: string) => void; // ✅ 現在只需要傳 Firestore ID
  activeTripId: string | null; // ✅ 改為字串
  role: Role;
}

export default function HomePage({ onSelectTrip, activeTripId, role }: HomePageProps) {
  const { user } = useAuth();
  const isAnonGuest = role === 'guest' && !user;
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  // ✅ 直接從 Firestore 抓取與這個人有關的所有行程 (包含 Admin 與 Collaborator)
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
      // ✅ 直接在 Firestore 建立新文件
      const docRef = await addDoc(collection(firestore, 'trips'), newTrip);

      setShowCreate(false);
      setNewName('');
      setNewStart('');
      setNewEnd('');

      // ✅ 建立完成後直接跳轉進去
      onSelectTrip(docRef.id);
    } catch (error) {
      console.error('建立行程失敗:', error);
      alert('建立行程失敗，請檢查網路連線。');
    }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('確定要刪除此行程嗎？這會刪除雲端上的所有資料！')) return;
    try {
      // 刪除所有子集合中的文件，避免在 Firestore 留下無法輕易刪除的「幽靈文件」
      const subcollections = [
        'days', 'places', 'notes', 'attachments', 
        'flights', 'hotels', 'tickets', 'checklistItems', 
        'budgetItems', 'resources'
      ];

      for (const sub of subcollections) {
        const subRef = collection(firestore, 'trips', id, sub);
        const snap = await getDocs(subRef);
        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      }

      // 最後刪除主文件
      await deleteDoc(doc(firestore, 'trips', id));
      if (activeTripId === id) {
        onSelectTrip(''); // 取消選取
      }
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
        {!isAnonGuest && user && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            ＋ 新增行程
          </button>
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

      {loading ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', display: 'inline-block', animation: 'spin 2s linear infinite', lineHeight: 1 }}>⏳</div>
          <p>載入雲端行程中...</p>
        </div>
      ) : !firestoreTrips || firestoreTrips.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '3rem' }}>🤷‍♀️</p>
          <p>目前沒有行程，試著新增一個吧！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          {firestoreTrips.map((tripInfo: FirestoreTripInfo, idx: number) => {
            const isOwner = user?.uid === tripInfo.adminUid || 
                           (tripInfo.adminEmail && normalizeEmail(tripInfo.adminEmail) === userEmailNorm) ||
                           (!tripInfo.adminUid && !isAnonGuest);
            
            // 判斷是否有權限進入：是擁有者、是全域管理員、或在協作者/成員名單內
            const isCollaborator = !!(tripInfo.collaboratorEmails?.includes(userEmailNorm) || 
                                     tripInfo.memberEmails?.includes(userEmailNorm));
            
            const canAccess = !!(isGlobalAdmin || isOwner || isCollaborator);

            return (
              <TripCard
                key={tripInfo.firestoreId}
                trip={tripInfo}
                isActive={tripInfo.firestoreId === activeTripId}
                isGuest={isAnonGuest}
                canAccess={canAccess}
                onSelect={() => onSelectTrip(tripInfo.firestoreId)}
                onDelete={() => deleteTrip(tripInfo.firestoreId)}
                onUpdate={(updates) => updateTrip(tripInfo.firestoreId, updates)}
                isOwner={isOwner}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// 簡化版的 TripCard，直接吃 FirestoreTripInfo
function TripCard({
  trip,
  isActive,
  isGuest,
  canAccess,
  onSelect,
  onDelete,
  onUpdate,
  isOwner,
}: {
  trip: any; // 從 useFirestoreTrips 回傳的格式
  isActive: boolean;
  isGuest: boolean;
  canAccess: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: any) => void;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trip.name);

  const saveName = () => {
    if (name.trim() && name.trim() !== trip.name) {
      onUpdate({ name: name.trim() });
    }
    setEditing(false);
  };

  const disabled = !canAccess || isGuest;

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
            {isOwner && <button className="btn-icon btn-danger" onClick={onDelete} title="刪除">🗑️</button>}
          </div>
        )}
      </div>
    </div>
  );
}