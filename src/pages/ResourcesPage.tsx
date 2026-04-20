import { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { Resource, TripNote } from '../types';
import { useAuth } from '../context/AuthContext';
import { normalizeEmail } from '../utils/emails';
import { useFirestoreQuery } from '../hooks/useFirestoreQuery';
import InlineEdit from '../components/shared/InlineEdit';
import PageLoader from '../components/shared/PageLoader';

interface ResourcesPageProps {
  tripId: string;
  readOnly?: boolean;
}

export default function ResourcesPage({ tripId, readOnly = false }: ResourcesPageProps) {
  // 🔒 權限判斷邏輯
  const { role, user, tripMeta } = useAuth();
  const isAdmin = role === 'admin';
  const myEmail = user?.email ? normalizeEmail(user.email) : '';
  const collabs = tripMeta?.collaborators || {};
  const myCollab = collabs[myEmail] || Object.values(collabs).find((c: any) => normalizeEmail(c.email) === myEmail);
  const perms = myCollab?.permissions || {};
  const hasAccess = isAdmin || (myCollab && perms['resources'] !== 'none');

  // 🚫 如果沒有權限，直接整頁隱藏
  if (!hasAccess) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🚫</p>
        <p>您沒有檢視資源連結的權限</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>備忘 & 連結 🔗</h1>
      </div>

      <TripNotes tripId={tripId} readOnly={readOnly} />

      <hr style={{ margin: 'var(--sp-xl) 0', border: 'none', borderTop: '2px dashed var(--border)' }} />

      <ManualLinks tripId={tripId} readOnly={readOnly} />
    </div>
  );
}

/* ========== Trip Notes Section ========== */
function TripNotes({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const notes = useFirestoreQuery<TripNote>(tripId, 'tripNotes', 'sortOrder');

  const addNote = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'tripNotes'), {
      tripId: String(tripId),
      content: '',
      sortOrder: notes?.length ?? 0,
    });
  };

  const update = async (id: string, content: string) => {
    if (readOnly || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'tripNotes', String(id)), { content });
  };

  const remove = async (id: string) => {
    if (readOnly || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'tripNotes', String(id)));
  };

  return (
    <div style={{ marginBottom: 'var(--sp-xl)' }}>
      <div className="section-title" style={{ fontSize: '1.1rem', marginBottom: 'var(--sp-md)' }}>📝 旅程備忘錄</div>
      <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
        {notes?.map(n => (
          <div key={n.id} className="card" style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', padding: 'var(--sp-md)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineEdit
                value={n.content}
                onSave={v => update(n.id!, v)}
                placeholder="點擊新增備忘錄 (支援 Markdown)..."
                multiline
                markdown
                readOnly={readOnly}
              />
            </div>
            {!readOnly && (
              <button
                className="btn-icon btn-danger"
                style={{ fontSize: '0.7rem', flexShrink: 0, marginTop: '2px' }}
                onClick={() => window.confirm('確定刪除這個備忘錄嗎？') && remove(n.id!)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <button className="btn btn-secondary" onClick={addNote} style={{ marginTop: 'var(--sp-sm)', fontSize: '0.8rem' }}>
          ＋ 新增備忘錄
        </button>
      )}
    </div>
  );
}

/* ========== Manual Links Section ========== */
function ManualLinks({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const resources = useFirestoreQuery<Resource>(tripId, 'resources', 'sortOrder');

  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('');

  if (resources === undefined) return <PageLoader />;

  const addResource = async () => {
    if (!tripId) return;
    const url = newUrl.trim();
    if (!url) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'resources'), {
      tripId: String(tripId),
      title: newTitle.trim() || url,
      url,
      category: newCategory.trim() || null,
      sortOrder: resources?.length ?? 0,
    });
    setNewTitle('');
    setNewUrl('');
    setNewCategory('');
  };

  const deleteResource = async (id: string) => {
    if (!tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'resources', String(id)));
  };

  const updateResource = async (id: string, updates: Partial<Resource>) => {
    if (!tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'resources', String(id)), updates);
  };

  // Group by category
  const grouped: Record<string, Resource[]> = {};
  const uncategorized: Resource[] = [];
  resources?.forEach(r => {
    if (r.category) {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    } else {
      uncategorized.push(r);
    }
  });

  return (
    <div>
      {/* Add form — hidden in read-only mode */}
      {!readOnly && (
        <div className="card" style={{ marginBottom: 'var(--sp-md)' }}>
          <div className="section-title" style={{ fontSize: '0.9rem' }}>＋ 新增連結</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://..."
              onKeyDown={e => e.key === 'Enter' && addResource()}
            />
            <div className="form-row">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="標題（選填）"
              />
              <input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="類別（選填）"
              />
            </div>
            <button className="btn btn-primary" onClick={addResource} style={{ alignSelf: 'flex-end' }}>
              新增
            </button>
          </div>
        </div>
      )}

      {/* Resources list */}
      {(!resources || resources.length === 0) ? (
        <div className="empty-state">
          <p style={{ fontSize: '2.5rem' }}>📌</p>
          <p>還沒有連結，在上方新增實用網址吧！</p>
        </div>
      ) : (
        <>
          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-lg)' }}>
              {uncategorized.map(r => (
                <ResourceCard key={r.id} resource={r} onDelete={deleteResource} onUpdate={updateResource} readOnly={readOnly} />
              ))}
            </div>
          )}
          {/* Categorized */}
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 'var(--sp-lg)' }}>
              <div className="section-title">{cat}</div>
              {items.map(r => (
                <ResourceCard key={r.id} resource={r} onDelete={deleteResource} onUpdate={updateResource} readOnly={readOnly} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ResourceCard({
  resource: r,
  onDelete,
  onUpdate,
  readOnly = false,
}: {
  resource: Resource;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Resource>) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(r.title);
  const [url, setUrl] = useState(r.url);
  const [category, setCategory] = useState(r.category || '');

  const save = () => {
    onUpdate(r.id!, { title: title.trim() || url.trim(), url: url.trim(), category: category.trim() || undefined });
    setEditing(false);
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-xs)', padding: 'var(--sp-sm) var(--sp-md)' }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="標題" />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="網址" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="類別" />
          <div style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setEditing(false)} style={{ fontSize: '0.75rem' }}>取消</button>
            <button className="btn btn-primary" onClick={save} style={{ fontSize: '0.75rem' }}>儲存</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.title}</div>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.78rem', color: 'var(--accent-light)', wordBreak: 'break-all' }}
            >
              {r.url}
            </a>
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexShrink: 0 }}>
              <button className="btn-icon btn-secondary" onClick={() => setEditing(true)} title="編輯" style={{ fontSize: '0.75rem' }}>✏️</button>
              <button className="btn-icon btn-danger" onClick={() => onDelete(r.id!)} title="刪除" style={{ fontSize: '0.75rem' }}>🗑️</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}