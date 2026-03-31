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

    // Log the full payload to debug field names
    console.log('Webhook payload:', JSON.stringify(body, null, 2));

    const supabase = getServiceClient();

    // Resend webhook wraps in { type, data } OR sends flat — handle both
    const payload = body.data || body;

    // Resend uses various field names depending on version
    const fromAddr = payload.from || payload.sender;
    const to = payload.to || payload.recipient;
    const cc = payload.cc;
    const subject = payload.subject;
    const text = payload.text || payload.text_body || payload.plain_text || payload.body;
    const html = payload.html || payload.html_body;
    const emailId = payload.email_id || payload.id || payload.message_id;
    const headers = payload.headers;

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

    // Log what we're about to insert
    console.log('Inserting email:', { fromEmail, fromName, subject, hasText: !!text, hasHtml: !!html });

    const { error } = await supabase.from('emails').insert({
      message_id: emailId || `inbound-${Date.now()}`,
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
