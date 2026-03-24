import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { Webhook } from 'svix';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify webhook signature
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) {
      const wh = new Webhook(secret);
      try {
        wh.verify(rawBody, {
          'svix-id': req.headers.get('svix-id') || '',
          'svix-timestamp': req.headers.get('svix-timestamp') || '',
          'svix-signature': req.headers.get('svix-signature') || '',
        });
      } catch {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);

    const supabase = getServiceClient();

    // Resend inbound webhook payload
    const { data } = body;
    if (!data) {
      return NextResponse.json({ error: 'No data' }, { status: 400 });
    }

    const {
      email_id,
      from: fromAddr,
      to,
      cc,
      subject,
      text,
      html,
      headers,
    } = data;

    // Extract from name and email
    const fromMatch = fromAddr?.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : null;
    const fromEmail = fromMatch ? fromMatch[2] : fromAddr;

    // Parse to/cc as arrays
    const toAddresses = Array.isArray(to) ? to : [to].filter(Boolean);
    const ccAddresses = cc ? (Array.isArray(cc) ? cc : [cc]) : null;

    // Get In-Reply-To and References from headers
    const inReplyTo = headers?.['in-reply-to'] || headers?.['In-Reply-To'] || null;
    const references = headers?.['references'] || headers?.['References'];
    const refsArray = references ? references.split(/\s+/).filter(Boolean) : null;

    const { error } = await supabase.from('emails').insert({
      message_id: email_id || `inbound-${Date.now()}`,
      from_address: fromEmail,
      from_name: fromName,
      to_addresses: toAddresses,
      cc_addresses: ccAddresses,
      subject,
      text_body: text,
      html_body: html,
      direction: 'inbound',
      in_reply_to: inReplyTo,
      references: refsArray,
    });

    if (error) {
      console.error('DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
