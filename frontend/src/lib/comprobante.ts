/**
 * Comprime imágenes en el navegador antes de subirlas (Fase 3).
 * Redimensiona al lado mayor `maxSize` y exporta JPEG, para ahorrar Storage.
 * Los PDFs no se tocan.
 */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<Blob> {
  const img = await loadImage(file);
  let { width, height } = img;
  const largest = Math.max(width, height);
  if (largest > maxSize) {
    const scale = maxSize / largest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
  });
}
