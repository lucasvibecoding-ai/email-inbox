import type { SupabaseClient } from '@supabase/supabase-js';

export const ATTACHMENTS_BUCKET = 'email-attachments';

interface ResendAttachment {
  id: string;
  filename: string;
  size: number;
  content_type: string;
  download_url: string;
}

/** Fetch a received email's attachments from Resend, store the bytes in
 *  Supabase Storage, and record them in the attachments table. Idempotent:
 *  does nothing if this email already has attachment rows. Returns the count
 *  of attachments stored. Never throws (best effort). */
export async function captureAttachments(
  supabase: SupabaseClient,
  resendApiKey: string,
  resendEmailId: string,
  emailRowId: string,
): Promise<number> {
  if (!resendApiKey || !resendEmailId) return 0;
  try {
    const { count } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('email_id', emailRowId);
    if (count && count > 0) return 0;

    const listRes = await fetch(
      `https://api.resend.com/emails/receiving/${resendEmailId}/attachments`,
      { headers: { Authorization: `Bearer ${resendApiKey}` } },
    );
    if (!listRes.ok) return 0;
    const list = await listRes.json();
    const attachments: ResendAttachment[] = list?.data || [];
    if (!attachments.length) return 0;

    let stored = 0;
    for (const att of attachments) {
      try {
        if (!att.download_url) continue;
        const fileRes = await fetch(att.download_url);
        if (!fileRes.ok) continue;
        const bytes = Buffer.from(await fileRes.arrayBuffer());
        const safeName = (att.filename || 'file').replace(/[^\w.-]+/g, '_').slice(0, 120);
        const path = `${emailRowId}/${att.id}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, bytes, {
            contentType: att.content_type || 'application/octet-stream',
            upsert: true,
          });
        if (upErr) continue;
        await supabase.from('attachments').insert({
          email_id: emailRowId,
          filename: att.filename || 'file',
          content_type: att.content_type || null,
          size: att.size || bytes.length,
          url: path,
        });
        stored += 1;
      } catch (err) {
        console.error('Attachment store failed', att.id, err);
      }
    }
    return stored;
  } catch (err) {
    console.error('captureAttachments failed for', emailRowId, err);
    return 0;
  }
}

export interface AttachmentRow {
  id: string;
  email_id: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
}

/** Attachment metadata for a set of emails, grouped by email_id (for display). */
export async function getAttachmentsByEmail(
  supabase: SupabaseClient,
  emailIds: string[],
): Promise<Record<string, AttachmentRow[]>> {
  if (!emailIds.length) return {};
  const { data } = await supabase
    .from('attachments')
    .select('id, email_id, filename, content_type, size')
    .in('email_id', emailIds);
  const byEmail: Record<string, AttachmentRow[]> = {};
  for (const a of (data || []) as AttachmentRow[]) {
    (byEmail[a.email_id] ||= []).push(a);
  }
  return byEmail;
}

// --- Outbound attachments --------------------------------------------------
// Files the owner attaches to a reply. They do NOT travel through the API as
// base64: a Vercel function body is capped at 4.5 MB, which a single phone
// photo can exceed. Instead the browser uploads straight to Supabase Storage
// with a signed URL and the send call passes only the storage path.

/** An uploaded file, as the browser hands it to the send API. */
export interface OutboundAttachment {
  path: string;
  filename: string;
  contentType?: string | null;
  size?: number | null;
}

/** Everything outbound lives under this prefix, and a path outside it is
 *  rejected: the send API must never be talked into reading someone else's
 *  received attachment by path. */
const OUTBOUND_PREFIX = 'outbound/';

export const MAX_OUTBOUND_FILES = 10;
/** Resend caps a whole message at 40 MB; stay well under it after base64. */
export const MAX_OUTBOUND_TOTAL_BYTES = 20 * 1024 * 1024;

export function isOutboundPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith(OUTBOUND_PREFIX) &&
    !path.includes('..') &&
    path.length < 300
  );
}

/** A signed URL the browser can PUT one file to, plus the path to send back. */
export async function createOutboundUploadUrl(
  supabase: SupabaseClient,
  filename: string,
): Promise<{ path: string; signedUrl: string }> {
  const safeName = (filename || 'file').replace(/[^\w.-]+/g, '_').slice(0, 120);
  const path = `${OUTBOUND_PREFIX}${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not create an upload URL');
  }
  return { path, signedUrl: data.signedUrl };
}

/** Read the uploaded files back out of storage in the shape Resend wants.
 *  Throws if a file is missing or the set is too big, so a send never goes out
 *  silently missing what the owner attached. */
export async function loadOutboundAttachments(
  supabase: SupabaseClient,
  files: OutboundAttachment[],
): Promise<{ filename: string; content: string }[]> {
  if (files.length > MAX_OUTBOUND_FILES) {
    throw new Error(`Too many attachments (max ${MAX_OUTBOUND_FILES})`);
  }
  const out: { filename: string; content: string }[] = [];
  let total = 0;
  for (const f of files) {
    if (!isOutboundPath(f.path)) throw new Error('Invalid attachment');
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(f.path);
    if (error || !data) throw new Error(`Attachment "${f.filename}" could not be read`);
    const bytes = Buffer.from(await data.arrayBuffer());
    total += bytes.length;
    if (total > MAX_OUTBOUND_TOTAL_BYTES) {
      throw new Error('Attachments are too large together (max 20 MB)');
    }
    out.push({ filename: f.filename || 'file', content: bytes.toString('base64') });
  }
  return out;
}

/** Record sent files against the outbound row so the thread shows the same
 *  clips as received mail. Best effort: the mail is already gone, so a failure
 *  here must not fail the send. */
export async function recordOutboundAttachments(
  supabase: SupabaseClient,
  emailRowId: string,
  files: OutboundAttachment[],
): Promise<void> {
  if (!emailRowId || files.length === 0) return;
  try {
    await supabase.from('attachments').insert(
      files.map((f) => ({
        email_id: emailRowId,
        filename: f.filename || 'file',
        content_type: f.contentType || null,
        size: f.size ?? null,
        url: f.path,
      })),
    );
  } catch (err) {
    console.error('recordOutboundAttachments failed for', emailRowId, err);
  }
}
