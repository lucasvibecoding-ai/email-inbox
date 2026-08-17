import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccountByEmail } from '@/lib/accounts';
import { getAutoSend, getAutoAck } from '@/lib/settings';
import { getAttachmentsByEmail } from '@/lib/attachments';

// Must stay a single string literal: supabase-js infers the row type from the
// literal, and building it with join() widens it to `string` and erases the
// types. Mirrors the fields mapped in the response below.
const LIST_COLUMNS =
  'id,message_id,from_address,from_name,to_addresses,subject,text_body,created_at,references,is_archived,ai_status,ai_category,ai_confidence,ai_draft,ai_reason,ai_processed_at';

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

  // Only the columns this view maps below. html_body is deliberately absent:
  // it is the biggest column in the table and pulling it for 200 rows on every
  // poll was the single largest source of Supabase egress in this project. The
  // handful of rows that genuinely need it for their preview are topped up in a
  // second, much smaller query further down.
  let listQuery = supabase
    .from('emails')
    .select(LIST_COLUMNS)
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

  const rows = data || [];

  // About 7% of inbound mail arrives with no text_body at all, so its preview
  // can only come from the HTML. Those bodies are big, so fetch html_body only
  // for the rows that need it AND that we have not already previewed. An
  // email's body never changes after insert, so a cached preview stays valid
  // for the life of the instance and repeat polls cost nothing.
  const uncached = rows
    .filter((e) => !e.text_body && !previewCache.has(e.id))
    .map((e) => e.id);
  if (uncached.length) {
    const { data: htmlRows } = await supabase
      .from('emails')
      .select('id,html_body')
      .in('id', uncached);
    for (const r of htmlRows || []) {
      rememberPreview(r.id, makePreview(null, r.html_body));
    }
    // Anything the query did not return still gets an entry, so a row with no
    // body at all is not re-fetched on every single poll.
    for (const id of uncached) if (!previewCache.has(id)) rememberPreview(id, '');
  }

  const attByEmail = await getAttachmentsByEmail(supabase, rows.map((e) => e.id));

  const emails = rows.map((e) => {
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
      preview: e.text_body ? makePreview(e.text_body, null) : previewCache.get(e.id) || '',
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
  const autoAck = await getAutoAck(supabase);
  return NextResponse.json({
    counts: { needs_you: nu.count || 0, replied: rp.count || 0, no_reply: nr.count || 0, spam: sp.count || 0, all: al.count || 0 },
    autoSend,
    autoAck,
    emails,
  });
}

// Previews for bodies that only exist as HTML, keyed by email id. Bounded so a
// long-lived instance cannot grow without limit; entries are pure derived data,
// so evicting one only costs a re-fetch.
const PREVIEW_CACHE_MAX = 2000;
const previewCache = new Map<string, string>();

function rememberPreview(id: string, preview: string): void {
  previewCache.set(id, preview);
  while (previewCache.size > PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest === undefined) break;
    previewCache.delete(oldest);
  }
}

function makePreview(text: string | null, html: string | null): string {
  const src = text && text.trim() ? text : (html || '').replace(/<[^>]*>/g, ' ');
  return src.replace(/\s+/g, ' ').trim().slice(0, 180);
}
