import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { resend } from '@/lib/resend';

// GET /api/emails?folder=inbox|sent|starred|archived|trash
export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get('folder') || 'inbox';
  const search = req.nextUrl.searchParams.get('search') || '';
  const supabase = getServiceClient();

  let query = supabase
    .from('emails')
    .select('*')
    .order('created_at', { ascending: false });

  switch (folder) {
    case 'inbox':
      query = query.eq('direction', 'inbound').eq('is_archived', false).eq('is_trash', false);
      break;
    case 'sent':
      query = query.eq('direction', 'outbound').eq('is_trash', false);
      break;
    case 'starred':
      query = query.eq('is_starred', true).eq('is_trash', false);
      break;
    case 'archived':
      query = query.eq('is_archived', true).eq('is_trash', false);
      break;
    case 'trash':
      query = query.eq('is_trash', true);
      break;
  }

  if (search) {
    query = query.or(`subject.ilike.%${search}%,from_address.ilike.%${search}%,text_body.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/emails - Send a new email or reply
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, cc, bcc, subject, html, text, inReplyTo, references } = body;
    const from = `${process.env.SENDER_NAME || 'Sadie'} <${process.env.DEFAULT_EMAIL}>`;

    const headers: Record<string, string> = {};
    if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
    if (references?.length) headers['References'] = references.join(' ');

    const result = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || '',
      html: html || undefined,
      text: text || undefined,
      headers: Object.keys(headers).length ? headers : undefined,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Store sent email in DB
    const supabase = getServiceClient();
    await supabase.from('emails').insert({
      message_id: result.data?.id || `sent-${Date.now()}`,
      from_address: process.env.DEFAULT_EMAIL,
      from_name: process.env.SENDER_NAME || 'Sadie',
      to_addresses: Array.isArray(to) ? to : [to],
      cc_addresses: cc || null,
      bcc_addresses: bcc || null,
      subject,
      text_body: text || null,
      html_body: html || null,
      direction: 'outbound',
      is_read: true,
      in_reply_to: inReplyTo || null,
      references: references || null,
    });

    return NextResponse.json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Send error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
