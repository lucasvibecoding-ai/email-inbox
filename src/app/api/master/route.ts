import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccountByEmail } from '@/lib/accounts';
import { getAutoSend } from '@/lib/settings';
import { getAttachmentsByEmail } from '@/lib/attachments';

// GET /api/master?tab=needs_you|replied|no_reply|all
// Cross-account view of inbound email with its AI triage state, for the Master View.
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get('tab') || 'needs_you';
  const supabase = getServiceClient();

  const countBase = () =>
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .eq('is_trash', false);

  const [nu, rp, nr, sp, al] = await Promise.all([
    countBase().in('ai_status', ['needs_human', 'error']),
    countBase().eq('ai_status', 'auto_replied'),
    countBase().eq('ai_status', 'no_reply_needed').neq('ai_category', 'spam'),
    countBase().eq('ai_category', 'spam'),
    countBase(),
  ]);

  let listQuery = supabase
    .from('emails')
    .select('*')
    .eq('direction', 'inbound')
    .eq('is_trash', false);

  if (tab === 'replied') listQuery = listQuery.eq('ai_status', 'auto_replied');
  else if (tab === 'spam') listQuery = listQuery.eq('ai_category', 'spam');
  else if (tab === 'no_reply')
    listQuery = listQuery.eq('ai_status', 'no_reply_needed').neq('ai_category', 'spam');
  else if (tab !== 'all') listQuery = listQuery.in('ai_status', ['needs_human', 'error']);

  const { data, error } = await listQuery
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const attByEmail = await getAttachmentsByEmail(supabase, (data || []).map((e) => e.id));

  const emails = (data || []).map((e) => {
    const account =
      (e.to_addresses || []).map(getAccountByEmail).find(Boolean) || null;
    return {
      id: e.id,
      message_id: e.message_id,
      from_address: e.from_address,
      from_name: e.from_name,
      to_addresses: e.to_addresses,
      subject: e.subject,
      text_body: e.text_body,
      preview: makePreview(e.text_body, e.html_body),
      created_at: e.created_at,
      references: e.references,
      is_archived: e.is_archived,
      ai_status: e.ai_status,
      ai_category: e.ai_category,
      ai_confidence: e.ai_confidence,
      ai_draft: e.ai_draft,
      ai_reason: e.ai_reason,
      ai_processed_at: e.ai_processed_at,
      account: account
        ? {
            id: account.id,
            displayName: account.displayName,
            email: account.email,
            domain: account.domain,
          }
        : null,
      attachments: attByEmail[e.id] || [],
    };
  });

  const autoSend = await getAutoSend(supabase);
  return NextResponse.json({
    counts: { needs_you: nu.count || 0, replied: rp.count || 0, no_reply: nr.count || 0, spam: sp.count || 0, all: al.count || 0 },
    autoSend,
    emails,
  });
}

function makePreview(text: string | null, html: string | null): string {
  const src = text && text.trim() ? text : (html || '').replace(/<[^>]*>/g, ' ');
  return src.replace(/\s+/g, ' ').trim().slice(0, 180);
}
