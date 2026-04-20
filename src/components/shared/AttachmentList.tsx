import { useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery';
import type { Attachment, ParentType } from '../../types';

interface AttachmentListProps {
  parentId: string; // ✅ 確保這裡是 string
  parentType: ParentType;
}

export default function AttachmentList({ parentId, parentType }: AttachmentListProps) {
  // NOTE: attachments 目前設計是 Top-level collection (不屬於特定 Trip)，這在小型應用中可行。
  // 但因為 useFirestoreQuery 是設計給子集合使用的，這裡我們得另外處理。
  // 為了先維持一致性，我先保持原樣，但修正 id 使用。
  const allAttachments = useFirestoreQuery<Attachment>(null, 'attachments', 'createdAt') || [];
  const attachments = allAttachments.filter((a: Attachment) => a.parentType === parentType && String(a.parentId) === String(parentId));

  const [selected, setSelected] = useState<Attachment | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除檔案？') || !id) return;
    await deleteDoc(doc(firestore, 'attachments', String(id)));
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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{selected.fileName}</h3>
            <p>檔案預覽目前不支援 base64 顯示，請改用 Firebase Storage。</p>
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>關閉</button>
          </div>
        </div>
      )}
    </div>
  );
}