import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { firestore } from '../../firebase';
import type { ParentType } from '../../types';

interface FileUploadProps {
  tripId: string;
  parentId: string;
  parentType: ParentType;
}

interface EmbeddedFile {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

// Leave headroom below Firestore's per-field size limit for the data URL value.
const MAX_DATA_URL_LENGTH = 900_000;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('讀取檔案失敗，請重新選擇檔案。'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('圖片無法讀取，請改用其他圖片檔案。'));
    };
    image.src = url;
  });
}

async function compressImage(file: File): Promise<EmbeddedFile> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('瀏覽器無法處理圖片壓縮。');

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, 2000 / longestSide);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const quality = Math.max(0.35, 0.88 - attempt * 0.08);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      const fileName = file.name.replace(/\.[^.]+$/, '') || 'image';
      return { dataUrl, fileName: `${fileName}.jpg`, mimeType: 'image/jpeg' };
    }

    scale *= 0.8;
  }

  throw new Error('圖片壓縮後仍超過上傳限制，請選擇較小的圖片。');
}

async function prepareFile(file: File): Promise<EmbeddedFile> {
  const dataUrl = await readAsDataUrl(file);
  if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
    return { dataUrl, fileName: file.name, mimeType: file.type };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('檔案過大，請上傳小於約 650 KB 的檔案。');
  }

  return compressImage(file);
}

export default function FileUpload({ tripId, parentId, parentType }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = `upload-${parentType}-${parentId}`;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !tripId) return;

    setUploading(true);
    setError('');
    try {
      const preparedFile = await prepareFile(file);
      await addDoc(collection(firestore, 'trips', String(tripId), 'attachments'), {
        parentId,
        parentType,
        fileName: preparedFile.fileName,
        mimeType: preparedFile.mimeType,
        blobBase64: preparedFile.dataUrl,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error('附件上傳失敗:', err);
      setError(err instanceof Error ? err.message : '附件上傳失敗，請稍後再試。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input type="file" id={inputId} style={{ display: 'none' }} onChange={handleUpload} />
      <button
        className="btn btn-secondary"
        onClick={() => document.getElementById(inputId)?.click()}
        disabled={uploading}
        style={{ fontSize: '0.75rem' }}
      >
        {uploading ? '上傳中...' : '📎 附加檔案'}
      </button>
      {error && <div style={{ marginTop: 4, color: 'var(--danger)', fontSize: '0.75rem' }}>{error}</div>}
    </div>
  );
}
