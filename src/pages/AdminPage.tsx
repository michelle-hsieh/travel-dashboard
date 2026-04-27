import { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { PermissionLevel, PermissionTab, TabPermissions, Collaborator } from '../types';
import { normalizeEmail, collaboratorKey } from '../utils/emails';

const TAB_LABELS: Record<PermissionTab, string> = {
  planner: '行程',
  flights: '航班',
  hotels: '住宿',
  tickets: '票券',
  checklist: '清單',
  budget: '預算',
  resources: '連結',
};

const PERMISSION_OPTIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'read', label: '可讀' },
  { value: 'write', label: '可編輯' },
];

const DEFAULT_PERMISSIONS: TabPermissions = {
  planner: 'none',
  flights: 'none',
  hotels: 'none',
  tickets: 'none',
  checklist: 'none',
  budget: 'none',
  resources: 'none',
};

export default function AdminPage({ tripId }: { tripId: string }) {
  const { role, tripMeta } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPerms, setNewPerms] = useState<TabPermissions>({
    planner: 'read',
    flights: 'read',
    hotels: 'read',
    tickets: 'read',
    checklist: 'read',
    budget: 'read',
    resources: 'read',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (role !== 'admin') {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🔒</p>
        <p>只有管理者可以設定權限。</p>
      </div>
    );
  }

  const collaborators = tripMeta?.collaborators ?? {};
  const publicPermissions = tripMeta?.publicPermissions ?? DEFAULT_PERMISSIONS;
  const collabList: (Collaborator & { key: string })[] = Object.entries(collaborators).map(
    ([key, val]) => ({ ...val, key })
  );

  const savePublicPermissions = async (permissions: TabPermissions) => {
    setSaving(true);
    setMessage('');
    try {
      await updateDoc(doc(firestore, 'trips', tripId), { publicPermissions: permissions });
      setMessage('已更新預設權限。');
    } catch (err) {
      console.error('Failed to save public permissions:', err);
      setMessage('更新預設權限失敗。');
    } finally {
      setSaving(false);
    }
  };

  const saveCollaborator = async (email: string, permissions: TabPermissions) => {
    setSaving(true);
    setMessage('');
    try {
      const key = collaboratorKey(email);
      const legacyKey = email.toLowerCase().split('.').join('_');
      const tripRef = doc(firestore, 'trips', tripId);
      const snap = await getDoc(tripRef);
      const existing = snap.exists() ? snap.data() : {};

      const collabs = { ...(existing.collaborators ?? {}) };
      collabs[key] = { email: normalizeEmail(email), permissions };

      if (legacyKey !== key && collabs[legacyKey]) {
        delete collabs[legacyKey];
      }

      const collaboratorEmails = Object.values(collabs).map((c: any) =>
        normalizeEmail((c as Collaborator).email)
      );

      await updateDoc(tripRef, {
        collaborators: collabs,
        memberEmails: collaboratorEmails,
        collaboratorEmails,
      });

      setMessage(`已儲存 ${email} 的權限。`);
    } catch (err) {
      console.error('Failed to save collaborator:', err);
      setMessage('儲存協作者權限失敗。');
    } finally {
      setSaving(false);
    }
  };

  const removeCollaborator = async (key: string) => {
    setSaving(true);
    setMessage('');
    try {
      const tripRef = doc(firestore, 'trips', tripId);
      const snap = await getDoc(tripRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const collabs = { ...(data.collaborators ?? {}) };
      delete collabs[key];

      const collaboratorEmails = Object.values(collabs).map((c: any) =>
        normalizeEmail((c as Collaborator).email)
      );

      await updateDoc(tripRef, {
        collaborators: collabs,
        memberEmails: collaboratorEmails,
        collaboratorEmails,
      });

      setMessage('已移除協作者。');
    } catch (err) {
      console.error('Failed to remove collaborator:', err);
      setMessage('移除協作者失敗。');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = () => {
    const email = newEmail.trim();
    if (!email || !email.includes('@')) {
      setMessage('請輸入有效的 Email。');
      return;
    }
    void saveCollaborator(email, newPerms);
    setNewEmail('');
  };

  const renderPermissionGrid = (
    permissions: TabPermissions,
    onChange: (tab: PermissionTab, value: PermissionLevel) => void
  ) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 'var(--sp-sm)',
      }}
    >
      {(Object.keys(TAB_LABELS) as PermissionTab[]).map((tab) => (
        <div
          key={tab}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: '0.85rem' }}
        >
          <label style={{ minWidth: 60 }}>{TAB_LABELS[tab]}</label>
          <select
            value={permissions[tab] || 'none'}
            onChange={(e) => onChange(tab, e.target.value as PermissionLevel)}
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
  );

  return (
    <div>
      <div className="page-header">
        <h1>權限管理</h1>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-md)' }}>
        這裡可以設定所有分頁的可讀取與可編輯權限，現在包含清單與預算。
      </p>

      <div
        className="card"
        style={{
          marginBottom: 'var(--sp-lg)',
          border: '1px solid var(--accent)',
          background: 'rgba(var(--accent-rgb, 176,141,122), 0.03)',
        }}
      >
        <div className="section-title" style={{ color: 'var(--accent)', margin: 0, marginBottom: 'var(--sp-xs)' }}>
          預設權限
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--sp-sm)' }}>
          套用給未在下方協作者名單中的使用者。
        </p>
        {renderPermissionGrid(publicPermissions, (tab, value) => {
          void savePublicPermissions({ ...publicPermissions, [tab]: value });
        })}
      </div>

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
          {renderPermissionGrid(newPerms, (tab, value) => {
            setNewPerms((prev) => ({ ...prev, [tab]: value }));
          })}
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

      <div className="section-title">目前協作者</div>
      {collabList.length === 0 ? (
        <div className="empty-state">
          <p>目前沒有協作者。</p>
        </div>
      ) : (
        collabList.map((collab) => (
          <div key={collab.key} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--sp-sm)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{collab.email}</div>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 'var(--sp-xs)' }}>
                  {(Object.keys(TAB_LABELS) as PermissionTab[]).map((tab) => (
                    <div
                      key={tab}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: '0.8rem' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{TAB_LABELS[tab]}:</span>
                      <select
                        value={collab.permissions[tab] || 'none'}
                        onChange={(e) => {
                          void saveCollaborator(collab.email, {
                            ...collab.permissions,
                            [tab]: e.target.value as PermissionLevel,
                          });
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
                onClick={() => void removeCollaborator(collab.key)}
                title="移除"
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
            background: message.includes('失敗')
              ? 'rgba(194, 138, 138, 0.15)'
              : 'rgba(143, 168, 155, 0.15)',
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
