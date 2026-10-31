/**
 * Phone cameras produce files of 4 MB and up, which is far more than a receipt needs
 * and a long wait on mobile data. Images are made smaller here, before they upload.
 */

export const MAX_RECEIPT_SIDE = 1600;
export const TARGET_RECEIPT_BYTES = 400 * 1024;

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42];
const WEB_FRIENDLY = /^image\/(jpeg|png|webp)$/;

export const isPdfFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export type ReceiptRejection = 'receiptType' | 'receiptTooLarge';

export function receiptRejection(file: Pick<File, 'name' | 'type' | 'size'>): ReceiptRejection | null {
  if (isPdfFile(file)) return file.size > MAX_PDF_BYTES ? 'receiptTooLarge' : null;
  if (!file.type.startsWith('image/')) return 'receiptType';
  return file.size > MAX_IMAGE_BYTES ? 'receiptTooLarge' : null;
}

/** The size to draw at: the long side capped, the shape kept, never made larger. */
export function fittedSize(width: number, height: number, maxSide = MAX_RECEIPT_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('undecodable')); };
    image.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('unencodable'))), 'image/jpeg', quality);
  });
}

/**
 * A PDF passes through. An image is drawn through an `<img>`, which applies the
 * camera's rotation, so a receipt shot sideways doesn't upload sideways. Rejects when
 * the browser can't read the file, which is how an HEIC looks outside Safari.
 */
export async function prepareReceipt(file: File): Promise<File> {
  if (isPdfFile(file)) return file;

  const image = await decode(file);
  const size = fittedSize(image.naturalWidth, image.naturalHeight);
  const alreadyFine = size.width === image.naturalWidth && file.size <= TARGET_RECEIPT_BYTES && WEB_FRIENDLY.test(file.type);
  if (alreadyFine) return file;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  // JPEG has no transparency, and a PNG's would otherwise come out black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);

  let blob = await encode(canvas, QUALITIES[0]);
  for (let i = 1; i < QUALITIES.length && blob.size > TARGET_RECEIPT_BYTES; i += 1) {
    blob = await encode(canvas, QUALITIES[i]);
  }
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}
