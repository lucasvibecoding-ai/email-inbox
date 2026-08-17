import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccountByEmail } from '@/lib/accounts';
import { getAttachmentsByEmail } from '@/lib/attachments';

// Most messages we will show for one correspondent, newest kept.
const CONVERSATION_LIMIT = 25;

// Every column the conversation needs EXCEPT html_body, which is by far the
// largest and is worth 91% of the payload on real conversations here (98% on
// the worst one: 1.9 MB down to 37 KB). Callers that only render plain text
// ask for ?light=1 and get this instead of the full row.
const CONVERSATION_COLUMNS_LIGHT =
  'id,message_id,thread_id,from_address,from_name,to_addresses,cc_addresses,subject,text_body,direction,is_read,is_starred,is_archived,is_trash,in_reply_to,references,created_at';

// A body only exists as HTML on roughly 7% of inbound mail. In light mode we
// top those up individually rather than fetching html_body for everyone, and
// only for the few most recent, so the cost stays bounded.
const LIGHT_HTML_TOPUP = 3;

type EmailRow = {
  id: string;
  direction: 'inbound' | 'outbound';
  from_address: string;
  to_addresses: string[] | null;
  is_trash: boolean;
  created_at: string;
  [key: string]: unknown;
};

// GET /api/emails/[id] - Get single email
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServiceClient();

  // Mark as read
  await supabase.from('emails').update({ is_read: true }).eq('id', id);

  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // The conversation is every message exchanged with this correspondent on
  // this inbox, oldest first.
  //
  // NOT grouped by thread_id. Inbound mail arrives with no In-Reply-To (the
  // webhook has no such field to store), so the DB trigger mints a fresh
  // thread_id for every incoming email and a customer's reply never joins the
  // thread it belongs to. Grouping by correspondent is the only thing that
  // reliably reconstructs the history.
  const account =
    (data.to_addresses || []).map(getAccountByEmail).find(Boolean) ||
    getAccountByEmail(data.from_address) ||
    null;
  const correspondent =
    data.direction === 'inbound' ? data.from_address : (data.to_addresses || [])[0] || null;

  const light = req.nextUrl.searchParams.get('light') === '1';
  const columns = light ? CONVERSATION_COLUMNS_LIGHT : '*';

  let threadRows: EmailRow[] = [];
  if (account && correspondent) {
    // Two queries rather than one .or(): addresses can contain characters that
    // need escaping in a PostgREST filter string, and merging here is cheap.
    const [{ data: fromThem }, { data: toThem }] = await Promise.all([
      supabase
        .from('emails')
        .select(columns)
        .eq('direction', 'inbound')
        .eq('from_address', correspondent)
        .order('created_at', { ascending: false })
        .limit(CONVERSATION_LIMIT),
      supabase
        .from('emails')
        .select(columns)
        .eq('direction', 'outbound')
        .contains('to_addresses', [correspondent])
        .order('created_at', { ascending: false })
        .limit(CONVERSATION_LIMIT),
    ]);

    const onThisInbox = (m: EmailRow) =>
      m.direction === 'inbound'
        ? (m.to_addresses || []).some(
            (a) => a?.toLowerCase() === account.email.toLowerCase(),
          )
        : (m.from_address || '').toLowerCase() === account.email.toLowerCase();

    // Cast: the select string is chosen at runtime (light vs full), so
    // supabase-js cannot infer the row shape from a literal here.
    const merged = [
      ...((fromThem || []) as unknown as EmailRow[]),
      ...((toThem || []) as unknown as EmailRow[]),
    ];

    threadRows = merged
      .filter(onThisInbox)
      .filter((m) => !m.is_trash || m.id === data.id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(-CONVERSATION_LIMIT);
    // Always include the email being viewed, even if a filter dropped it.
    if (!threadRows.some((m) => m.id === data.id)) threadRows.push(data);

    // Light mode skipped html_body wholesale; give it back only to the few
    // recent messages that have no plain text at all, or they would render
    // blank.
    if (light) {
      const needHtml = threadRows
        .filter((m) => !m.text_body && m.id !== data.id)
        .slice(-LIGHT_HTML_TOPUP)
        .map((m) => m.id);
      if (needHtml.length) {
        const { data: htmlRows } = await supabase
          .from('emails')
          .select('id,html_body')
          .in('id', needHtml);
        const byId = new Map((htmlRows || []).map((h) => [h.id, h.html_body]));
        for (const m of threadRows) {
          if (byId.has(m.id)) m.html_body = byId.get(m.id);
        }
      }
    }
  }
  const attByEmail = await getAttachmentsByEmail(supabase, [
    data.id,
    ...threadRows.map((t) => t.id),
  ]);
  data.attachments = attByEmail[data.id] || [];
  for (const t of threadRows) t.attachments = attByEmail[t.id] || [];

  return NextResponse.json({ email: data, thread: threadRows });
}

// PATCH /api/emails/[id] - Update email flags
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = getServiceClient();

  const allowed = ['is_read', 'is_starred', 'is_archived', 'is_trash', 'ai_status'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { error } = await supabase.from('emails').update(updates).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/emails/[id] - Permanently delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { error } = await supabase.from('emails').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
