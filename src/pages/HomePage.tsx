import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { Trip, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { FirestoreTripInfo, useFirestoreTrips } from '../hooks/useFirestoreSync';
import { normalizeEmail } from '../utils/emails';
import { exportTrip, importTrip } from '../utils/tripIO';
import NotionTimeline from '../components/shared/NotionTimeline';

interface HomePageProps {
  onSelectTrip: (firebaseId: string) => void;
  activeTripId: string | null;
  role: Role;
}

export default function HomePage({ onSelectTrip, activeTripId, role }: HomePageProps) {
  const { user } = useAuth();
  const isAnonGuest = role === 'guest' && !user;
  const [showCreate, setShowCreate] = useState(false);
  const [showImportHint, setShowImportHint] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');


  const { trips: firestoreTrips, loading } = useFirestoreTrips(user?.email ?? null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreate(false);
        setShowImportHint(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const createTrip = async () => {
    if (!newName.trim() || !user || creating) return;
    setCreating(true);
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
      setCreating(false);
      setShowCreate(false);
      setNewName('');
      setNewStart('');
      setNewEnd('');
      onSelectTrip(docRef.id);
    } catch (error) {
      setCreating(false);
      console.error('建立行程失敗:', error);
      alert('建立行程失敗，請檢查網路連線。');
    }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('確定要刪除此行程嗎？這會刪除雲端上的所有資料！')) return;
    setDeletingTripId(id);
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
    } finally {
      setDeletingTripId(null);
    }
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    try {
      await updateDoc(doc(firestore, 'trips', id), updates);
    } catch (error) {
      console.error('更新名稱失敗:', error);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    setImportProgress('讀取檔案中...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        const newId = await importTrip(json, user.uid, user.email || '', setImportProgress);
        onSelectTrip(newId);
        setImporting(false);
        setImportProgress('');
      } catch (err: any) {
        console.error('匯入失敗:', err);
        alert(`匯入失敗: ${err.message}`);
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  const userEmailNorm = user?.email ? normalizeEmail(user.email) : '';
  const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').toLowerCase().trim();
  const isGlobalAdmin = userEmailNorm === normalizeEmail(ADMIN_EMAIL);

  return (
    <div>
      <div className="page-header">
        <h1>我的旅途 🌍</h1>
        {isGlobalAdmin && (
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <input
              type="file"
              id="import-trip-input"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="btn btn-secondary"
                onClick={() => document.getElementById('import-trip-input')?.click()}
                disabled={importing}
              >
                📁 匯入行程
              </button>
              <button
                className="btn-icon"
                title="查看匯入格式說明"
                onClick={() => setShowImportHint(true)}
                style={{ width: 28, height: 28, fontSize: '0.8rem', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '50%', color: 'var(--accent)', fontWeight: 700 }}
              >
                ?
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ 新增行程</button>
          </div>
        )}
      </div>
      {showImportHint && (
        <div className="modal-overlay" onClick={() => setShowImportHint(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}>
            <button
              className="btn-icon"
              onClick={() => setShowImportHint(false)}
              style={{ position: 'absolute', top: 12, right: 12, fontSize: '1.2rem', opacity: 0.6 }}
              title="關閉 (Esc)"
            >
              ✕
            </button>
            <h2>📁 匯入行程說明</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-md)' }}>
              匯入行程需要提供一個 <strong>.json</strong> 格式的檔案，您可以透過以下兩種方式取得：
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-md)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', fontSize: '1.05rem' }}>✅ 方法一：從本應用匯出</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', opacity: 0.9 }}>點擊任何旅程卡片右上角的 📤 按鈕，即可匯出標準格式的 JSON 檔案，可直接重新匯入。</p>
              </div>
              <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-md)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', fontSize: '1.05rem' }}>🤖 方法二：叫 AI 幫您轉換</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', opacity: 0.9, marginBottom: 8 }}>開啟左下角的 AI 助理（🤖），上傳您的旅遊資料（PDF、Word、Excel、Markdown 等），然後說：</p>
                <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: '8px 12px', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid var(--accent)', color: 'var(--text-primary)', fontWeight: 600 }}>
                  「請幫我把這份行程轉換成可以匯入的 JSON 格式」
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8 }}>⚠️ 注意：AI 無法讀取 Excel 的公式 and 格式，建議先另存為文字或 CSV。若某景點無法判斷日期，AI 會自動歸類到「待排」區。</p>
              </div>
              <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-md)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', fontSize: '1.05rem' }}>📄 JSON 結構範本</div>
                <pre style={{ fontSize: '0.72rem', overflow: 'auto', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6, maxHeight: 200 }}>{`{
  "name": "2026 京都大阪六天五夜",
  "startDate": "2026-04-10",
  "endDate": "2026-04-15",
  "subcollections": {
    "days": [
      { "id": "day1", "dayNumber": 1, "date": "2026-04-10", "sortOrder": 0, "notes": "第一天班機可能delay，保留彈性" }
    ],
    "places": [
      { "name": "嵐山竹林", "dayId": "day1", "sortOrder": 0 },
      { "name": "金閣寺", "dayId": "pool", "sortOrder": 1 }
    ],
    "flights": [
      { "airline": "長榮", "flightNo": "BR197",
        "departureAirport": "TPE", "arrivalAirport": "KIX",
        "departureTime": "2026-04-10 09:00" }
    ],
    "hotels": [
      { "name": "京都 APA 旅館", "checkIn": "2026-04-10", "checkOut": "2026-04-13" }
    ],
    "checklistItems": [
      { "text": "護照", "category": "行前準備", "isDone": true },
      { "text": "生八橋", "category": "伴手禮", "recipient": "辦公室同事", "amount": 1500, "currency": "JPY" }
    ],
    "tripNotes": [
      { "content": "出發前記得買 eSim\\n- 去藥妝店買感冒藥", "sortOrder": 0 }
    ]
  }
}`}</pre>
              </div>
            </div>
            {/* Removed bottom close button */}
          </div>
        </div>
      )}

      {importing && (
        <div className="card" style={{ marginBottom: 'var(--sp-md)', border: '1px solid var(--accent)', background: 'rgba(var(--accent-rgb), 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
            <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{importProgress}</div>
          </div>
        </div>
      )}

      {deletingTripId && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-md)', padding: 'var(--sp-xl)' }}>
            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, borderTopColor: 'var(--danger)' }} />
            <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: '1.1rem' }}>正在刪除雲端資料...</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>請耐心等候，這可能會需要一些時間，請勿關閉網頁。</div>
          </div>
        </div>
      )}


      {creating && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-md)', padding: 'var(--sp-xl)' }}>
            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, borderTopColor: 'var(--accent)' }} />
            <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>正在建立行程...</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>請耐心等候，請勿關閉網頁。</div>
          </div>
        </div>
      )}

      {showCreate && !creating && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>新增行程</h2>
            <div className="form-group"><label>行程名稱</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 2026 京都賞櫻" autoFocus onKeyDown={e => e.key === 'Enter' && createTrip()} /></div>
            <div className="form-row">
              <div className="form-group"><label>開始日期</label><input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} /></div>
              <div className="form-group"><label>結束日期</label><input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>取消</button>
              <button className="btn btn-primary" onClick={createTrip} disabled={creating}>
                {creating ? <div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : '建立'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
          <div className="loading-pulse">載入雲端行程中...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {/* Notion Timeline always shown at top */}
          {firestoreTrips.length > 0 && (
            <NotionTimeline
              trips={firestoreTrips}
              activeTripId={activeTripId}
              userEmailNorm={userEmailNorm}
              isGlobalAdmin={isGlobalAdmin}
              user={user}
              onSelectTrip={onSelectTrip}
            />
          )}

          {/* Card list below */}
          <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
            {firestoreTrips.map((tripInfo) => {
              const isOwner = user?.uid === tripInfo.adminUid ||
                (tripInfo.adminEmail && normalizeEmail(tripInfo.adminEmail) === userEmailNorm);
              const isCollaborator = !!(tripInfo.collaboratorEmails?.includes(userEmailNorm) ||
                tripInfo.memberEmails?.includes(userEmailNorm));
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
                  onExport={() => exportTrip(tripInfo.firestoreId)}
                  isOwner={isOwner}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TripCard({ trip, isActive, isGuest, canAccess, onSelect, onDelete, onUpdate, onExport, isOwner }: any) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState(trip.startDate || '');
  const [endDate, setEndDate] = useState(trip.endDate || '');

  const saveEdits = () => {
    const updates: any = {};
    if (name.trim() && name.trim() !== trip.name) updates.name = name.trim();
    if (startDate !== trip.startDate) updates.startDate = startDate;
    if (endDate !== trip.endDate) updates.endDate = endDate;
    if (Object.keys(updates).length > 0) onUpdate(updates);
    setEditing(false);
  };

  const cancelEdits = () => {
    setName(trip.name);
    setStartDate(trip.startDate || '');
    setEndDate(trip.endDate || '');
    setEditing(false);
  };

  const disabled = !canAccess;

  const handleClick = () => {
    if (!disabled && !editing) onSelect();
  };

  return (
    <div
      className="card"
      style={{
        cursor: disabled ? 'not-allowed' : editing ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdits()}
              autoFocus
              onClick={e => e.stopPropagation()}
              style={{ marginBottom: 8 }}
            />
          ) : (
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {!canAccess && <span style={{ marginRight: 8 }}>🔒</span>}
              {trip.name}
            </h3>
          )}

          {editing ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>開始日期</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>結束日期</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              📅 {trip.startDate} ~ {trip.endDate}
            </div>
          )}

          {!canAccess && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>被授權後可查看詳情</div>}
        </div>

        {!isGuest && (
          <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
            {editing ? (
              <>
                <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={saveEdits}>儲存</button>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={cancelEdits}>取消</button>
              </>
            ) : (
              <>
                <button className="btn-icon" onClick={onExport} title="匯出行程" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>📤</button>
                {isOwner && (
                  <button className="btn-icon" title="編輯行程資訊" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }} onClick={() => setEditing(true)}>✏️</button>
                )}
                {isOwner && <button className="btn-icon btn-danger" onClick={onDelete}>🗑️</button>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
