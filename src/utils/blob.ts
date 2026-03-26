/**
 * Convert a File to a storable Blob and generate a thumbnail for images.
 */
export async function fileToBlob(file: File): Promise<{ blob: Blob; thumbnail?: Blob }> {
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });

  if (file.type.startsWith('image/')) {
    const thumbnail = await generateThumbnail(blob, 200);
    return { blob, thumbnail };
  }

  return { blob };
}

/**
 * Generate a thumbnail Blob from an image Blob.
 */
async function generateThumbnail(blob: Blob, maxSize: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.7
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Create an object URL for rendering a Blob in <img> or <iframe>.
 */
export function blobToObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Convert Blob to base64 string for JSON export.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 data URL back to Blob for import.
 */
export function base64ToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
