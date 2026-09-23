// Browser-side attachment upload. The file goes straight from the browser to
// Supabase Storage with a signed URL, never through a Vercel function body
// (which is capped at 4.5 MB), and the send call carries only the path.

export interface UploadedAttachment {
  path: string;
  filename: string;
  contentType: string;
  size: number;
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is ${formatBytes(file.size)}; the limit is 20 MB`);
  }
  const res = await fetch('/api/attachments/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  });
  const data = await res.json();
  if (!res.ok || !data?.signedUrl) {
    throw new Error(data?.error || 'Could not prepare the upload');
  }
  const put = await fetch(data.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload of ${file.name} failed (${put.status})`);
  return {
    path: data.path,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  };
}
