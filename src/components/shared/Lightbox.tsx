import { useState, useEffect } from 'react';
import { blobToObjectURL } from '../../utils/blob';

interface LightboxProps {
  blob: Blob;
  mimeType: string;
  fileName: string;
  onClose: () => void;
}

export default function Lightbox({ blob, mimeType, fileName, onClose }: LightboxProps) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const u = blobToObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      <div onClick={(e) => e.stopPropagation()}>
        {mimeType.startsWith('image/') ? (
          <img src={url} alt={fileName} />
        ) : mimeType === 'application/pdf' ? (
          <iframe src={url} title={fileName} style={{ width: '90vw', height: '85vh', border: 'none', borderRadius: '8px' }} />
        ) : (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '3rem' }}>📄</p>
            <p>{fileName}</p>
            <a href={url} download={fileName} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
