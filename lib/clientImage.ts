// Browser-only helpers for sending a food photo to /api/analyze-food.

// Phone photos are often 3–8 MB; the model doesn't need that. Downscaling
// makes the upload several times faster and keeps us under the server's cap.
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export class UploadAborted extends Error {}

// XMLHttpRequest instead of fetch so we can tell "upload finished" apart from
// "server finished thinking" and show the two steps honestly.
export function postPhoto(
  photo: Blob,
  hooks: { onUploaded: () => void; register: (xhr: XMLHttpRequest) => void },
): Promise<{ status: number; data: { analysis?: unknown; error?: string } | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    hooks.register(xhr);
    xhr.open("POST", "/api/analyze-food");
    xhr.upload.onload = hooks.onUploaded;
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON body (e.g. a gateway error page): caller falls back to a generic message.
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus. Coba lagi."));
    xhr.onabort = () => reject(new UploadAborted());
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    xhr.send(form);
  });
}
