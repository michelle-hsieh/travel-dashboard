import { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { PermissionLevel, PermissionTab, TabPermissions, Collaborator } from '../types';
import { normalizeEmail, collaboratorKey } from '../utils/emails';
import { db } from '../db/database'; // ✅ 新增引入本地 Dexie DB

const TAB_LABELS: Record<PermissionTab, string> = {
  planner: '行程',
  flights: '航班',
  hotels: '住宿',
  tickets: '票券',
  resources: '資源',
};

const PERMISSION_OPTIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'read', label: '可讀' },
  { value: 'write', label: '讀寫' },
];

export default function AdminPage({ tripId }: { tripId: string }) {
  const { role, tripMeta, user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPerms, setNewPerms] = useState<TabPermissions>({
    planner: 'read',
    flights: 'read',
    hotels: 'read',
    tickets: 'read',
    resources: 'read',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (role !== 'admin') {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🚫</p>
        <p>只有管理者可以調整權限</p>
      </div>
    );
  }

  const collaborators = tripMeta?.collaborators ?? {};
  const collabList: (Collaborator & { key: string })[] = Object.entries(collaborators).map(
    ([key, val]) => ({ ...val, key })
  );

  const saveCollaborator = async (email: string, permissions: TabPermissions) => {
    setSaving(true);
    setMessage('');
    try {
      const key = collaboratorKey(email);
      // 向下相容：清理舊版帶底線的 Key
      const legacyKey = email.toLowerCase().split('.').join('_');
      const tripRef = doc(firestore, 'trips', tripId);
      const snap = await getDoc(tripRef);
      const existing = snap.exists() ? snap.data() : {};

      // 複製一份現有的 collaborators
      const collabs = { ...(existing.collaborators ?? {}) };

      // 新增或更新權限
      collabs[key] = { email: normalizeEmail(email), permissions };

      // 如果存在舊版的 key，順手清掉
      if (legacyKey !== key && collabs[legacyKey]) {
        delete collabs[legacyKey];
      }

      const collaboratorEmails = Object.values(collabs).map((c: any) => normalizeEmail((c as Collaborator).email));

      // 1. 上傳到雲端
      await updateDoc(tripRef, {
        collaborators: collabs,
        memberEmails: collaboratorEmails,
        collaboratorEmails: collaboratorEmails
      });

      setMessage(`已更新 ${email} 的權限`);
    } catch (err) {
      console.error('Failed to save collaborator:', err);
      setMessage('儲存失敗，請確認您有權限或稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const removeCollaborator = async (key: string) => {
    setSaving(true);
    try {
      const tripRef = doc(firestore, 'trips', tripId);
      const snap = await getDoc(tripRef);
      if (snap.exists()) {
        const data = snap.data();

        // 複製一份現有的 collaborators
        const collabs = { ...(data.collaborators ?? {}) };

        // 在本地端徹底刪除它
        delete collabs[key];

        const collaboratorEmails = Object.values(collabs).map((c: any) => normalizeEmail((c as Collaborator).email));

        // 1. 上傳到雲端
        await updateDoc(tripRef, {
          collaborators: collabs,
          memberEmails: collaboratorEmails,
          collaboratorEmails: collaboratorEmails
        });

        setMessage('已移除協作者');
      }
    } catch (err) {
      console.error('Failed to remove collaborator:', err);
      setMessage('移除失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = () => {
    const email = newEmail.trim();
    if (!email || !email.includes('@')) {
      setMessage('請輸入有效的 Email');
      return;
    }
    saveCollaborator(email, newPerms);
    setNewEmail('');
  };

  return (
    <div>
      <div className="page-header">
        <h1>授權管理</h1>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-md)' }}>
        設定協作者的存取權限；只有管理者能編輯，協作者無法看到清單與預算的細節。
      </p>

      {/* Add new collaborator */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div className="section-title">新增協作者</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="friend@gmail.com"
            type="email"
            onKeyDown={(e) => e.key === 'Enter' && handleAddNew()}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--sp-sm)' }}>
            {(Object.keys(TAB_LABELS) as PermissionTab[]).map((tab) => (
              <div key={tab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: '0.85rem' }}>
                <label style={{ minWidth: 60 }}>{TAB_LABELS[tab]}</label>
                <select
                  value={newPerms[tab]}
                  onChange={(e) =>
                    setNewPerms((prev) => ({ ...prev, [tab]: e.target.value as PermissionLevel }))
                  }
                  style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                >
                  {PERMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleAddNew}
            disabled={saving}
            style={{ alignSelf: 'flex-end' }}
          >
            {saving ? '儲存中...' : '新增'}
          </button>
        </div>
      </div>

      {/* Current collaborators */}
      <div className="section-title">現有協作者</div>
      {collabList.length === 0 ? (
        <div className="empty-state">
          <p>目前沒有協作者</p>
        </div>
      ) : (
        collabList.map((collab) => (
          <div key={collab.key} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{collab.email}</div>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 'var(--sp-xs)' }}>
                  {(Object.keys(TAB_LABELS) as PermissionTab[]).map((tab) => (
                    <div key={tab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{TAB_LABELS[tab]}:</span>
                      <select
                        value={collab.permissions[tab] || 'none'}
                        onChange={(e) => {
                          const updated = { ...collab.permissions, [tab]: e.target.value as PermissionLevel };
                          saveCollaborator(collab.email, updated);
                        }}
                        style={{ fontSize: '0.75rem', padding: '1px 3px' }}
                      >
                        {PERMISSION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="btn-icon btn-danger"
                onClick={() => removeCollaborator(collab.key)}
                title="刪除"
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}

      {message && (
        <div
          style={{
            marginTop: 'var(--sp-md)',
            padding: 'var(--sp-sm) var(--sp-md)',
            borderRadius: 'var(--radius-sm)',
            background: message.includes('失敗') ? 'rgba(194, 138, 138, 0.15)' : 'rgba(143, 168, 155, 0.15)',
            color: message.includes('失敗') ? 'var(--danger)' : 'var(--success)',
            fontSize: '0.85rem',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}