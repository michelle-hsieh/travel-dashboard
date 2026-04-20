import { useState, useEffect } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery';
import type { Attachment, ParentType } from '../../types';

interface AttachmentListProps {
  tripId: string;
  parentId: string; // ✅ 確保這裡是 string
  parentType: ParentType;
}

export default function AttachmentList({ tripId, parentId, parentType }: AttachmentListProps) {
  const allAttachments = useFirestoreQuery<Attachment>(tripId, 'attachments', 'createdAt') || [];
  const attachments = allAttachments.filter((a: Attachment) => a.parentType === parentType && String(a.parentId) === String(parentId));

  const [selected, setSelected] = useState<Attachment | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除檔案？') || !id || !tripId) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'attachments', String(id)));
    if (selected?.id === id) setSelected(null);
  };

  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{ marginTop: 'var(--sp-sm)', display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
      {attachments.map((att: Attachment) => (
        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
          <span style={{ cursor: 'pointer', color: 'var(--accent-light)' }} onClick={() => setSelected(att)}>
            📎 {att.fileName}
          </span>
          <button className="btn-icon" style={{ fontSize: '0.6rem', color: 'var(--danger)' }} onClick={() => handleDelete(att.id!)}>✕</button>
        </div>
      ))}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              className="btn-icon"
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 12, right: 12, fontSize: '1.2rem', opacity: 0.6 }}
              title="關閉 (Esc)"
            >
              ✕
            </button>
            <h3 style={{ marginBottom: 'var(--sp-md)', wordBreak: 'break-all', paddingRight: 32 }}>{selected.fileName}</h3>
            {selected.mimeType?.startsWith('image/') && selected.blobBase64 ? (
              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-sm)', marginBottom: 'var(--sp-md)', display: 'flex', justifyContent: 'center' }}>
                <img src={selected.blobBase64} alt={selected.fileName} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '4px' }} />
              </div>
            ) : selected.blobBase64 ? (
              <div style={{ marginBottom: 'var(--sp-md)', textAlign: 'center', padding: 'var(--sp-lg) 0' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--sp-md)' }}>非圖片格式無法直接預覽</p>
                <a href={selected.blobBase64} download={selected.fileName} className="btn btn-primary" style={{ textDecoration: 'none' }}>⬇️ 下載檔案</a>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>找不到檔案內容</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
