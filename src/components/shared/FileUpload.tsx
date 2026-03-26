import { useRef } from 'react';
import { db } from '../../db/database';
import { fileToBlob } from '../../utils/blob';
import type { ParentType } from '../../types';

interface FileUploadProps {
  parentId: number;
  parentType: ParentType;
  onUploaded?: () => void;
}

export default function FileUpload({ parentId, parentType, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const { blob, thumbnail } = await fileToBlob(file);
      await db.attachments.add({
        parentId,
        parentType,
        fileName: file.name,
        mimeType: file.type,
        blob,
        thumbnail,
        createdAt: Date.now(),
      });
    }

    if (inputRef.current) inputRef.current.value = '';
    onUploaded?.();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
      <button
        className="btn btn-secondary"
        onClick={() => inputRef.current?.click()}
        title="上傳檔案"
      >
        📎 上傳
      </button>
    </>
  );
}
