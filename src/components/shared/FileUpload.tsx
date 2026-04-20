import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import type { ParentType } from '../../types';

interface FileUploadProps {
  tripId: string;
  parentId: string; // ✅ 改為 string
  parentType: ParentType;
}

export default function FileUpload({ tripId, parentId, parentType }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tripId) return;

    setUploading(true);
    try {
      // ⚠️ 注意：這裡的 blob 實作。
      // 在真實環境中，Blob/File 應該要上傳到 Firebase Storage，
      // 然後把 Storage 回傳的 URL 存進 Firestore。
      // 為了快速修復你的程式碼，我先暫時用 base64 string 存進去 (因為 Firestore 不能直接存 Blob 物件)

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result;

        // 直接存進 Firestore
        await addDoc(collection(firestore, 'trips', String(tripId), 'attachments'), {
          parentId,
          parentType,
          fileName: file.name,
          mimeType: file.type,
          blobBase64: base64data, // 暫時用 base64
          createdAt: Date.now(),
        });
        setUploading(false);
      };
      reader.readAsDataURL(file);

    } catch (err) {
      console.error('上傳失敗:', err);
      setUploading(false);
    }
  };

  return (
    <div>
      <input type="file" id={`upload-${parentId}`} style={{ display: 'none' }} onChange={handleUpload} />
      <button
        className="btn btn-secondary"
        onClick={() => document.getElementById(`upload-${parentId}`)?.click()}
        disabled={uploading}
        style={{ fontSize: '0.75rem' }}
      >
        {uploading ? '上傳中...' : '📎 附加檔案'}
      </button>
    </div>
  );
}