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
