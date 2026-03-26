import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { blobToObjectURL } from '../../utils/blob';
import Lightbox from './Lightbox';
import type { Attachment, ParentType } from '../../types';

interface AttachmentListProps {
  parentId: number;
  parentType: ParentType;
}

export default function AttachmentList({ parentId, parentType }: AttachmentListProps) {
  const attachments = useLiveQuery(
    () =>
      db.attachments
        .where('[parentType+parentId]')
        .equals([parentType, parentId])
        .toArray()
        .catch(() =>
          db.attachments
            .filter((a) => a.parentType === parentType && a.parentId === parentId)
            .toArray()
        ),
    [parentId, parentType]
  );

  const [selected, setSelected] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="thumbnail-grid">
        {attachments.map((att) => (
          <ThumbnailItem key={att.id} attachment={att} onClick={() => setSelected(att)} onDelete={async () => { await db.attachments.delete(att.id!); }} />
        ))}
      </div>
      {selected && (
        <Lightbox
          blob={selected.blob}
          mimeType={selected.mimeType}
          fileName={selected.fileName}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function ThumbnailItem({
  attachment,
  onClick,
  onDelete,
}: {
  attachment: Attachment;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const source = attachment.thumbnail || (attachment.mimeType.startsWith('image/') ? attachment.blob : null);
    if (source) {
      const u = blobToObjectURL(source);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [attachment]);

  const isImage = attachment.mimeType.startsWith('image/');

  return (
    <div style={{ position: 'relative' }}>
      <div className={isImage ? 'thumbnail' : 'thumbnail-file'} onClick={onClick} title={attachment.fileName}>
        {isImage && url ? (
          <img src={url} alt={attachment.fileName} />
        ) : (
          <span>{attachment.mimeType === 'application/pdf' ? '📑' : '📄'}</span>
        )}
      </div>
      <button
        className="btn-icon"
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 20,
          height: 20,
          fontSize: '0.7rem',
          background: 'var(--danger)',
          color: '#fff',
          borderRadius: '50%',
        }}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="刪除"
      >✕</button>
    </div>
  );
}
