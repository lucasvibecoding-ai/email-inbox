import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ATTACHMENTS_BUCKET } from '@/lib/attachments';

export const runtime = 'nodejs';

// GET /api/attachments/[id] — redirect to a short-lived signed download URL for
// the stored attachment. Auth is enforced by the proxy (session required).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { data: att, error } = await supabase
    .from('attachments')
    .select('url, filename')
    .eq('id', id)
    .single();
  if (error || !att?.url) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(att.url, 300, { download: att.filename || undefined });
  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
