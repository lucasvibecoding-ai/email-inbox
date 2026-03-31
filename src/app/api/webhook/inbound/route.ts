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
    const payload = body.data || body;

    const emailId = payload.email_id;
    const fromAddr = payload.from;
    const to = payload.to;
    const cc = payload.cc;
    const subject = payload.subject;

    // Webhook doesn't include body — fetch full email from Resend API
    let text = '';
    let html = '';

    if (emailId) {
      try {
        const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        });
        if (res.ok) {
          const fullEmail = await res.json();
          text = fullEmail.text || '';
          html = fullEmail.html || '';
          console.log('Fetched full email:', { hasText: !!text, hasHtml: !!html });
        } else {
          console.error('Failed to fetch email from Resend:', res.status, await res.text());
        }
      } catch (err) {
        console.error('Error fetching email from Resend:', err);
      }
    }

    // Extract from name and email
    const fromMatch = fromAddr?.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : null;
    const fromEmail = fromMatch ? fromMatch[2] : fromAddr;

    const toAddresses = Array.isArray(to) ? to : [to].filter(Boolean);
    const ccAddresses = cc?.length ? cc : null;

    const { error } = await supabase.from('emails').insert({
      message_id: payload.message_id || emailId || `inbound-${Date.now()}`,
      from_address: fromEmail,
      from_name: fromName,
      to_addresses: toAddresses,
      cc_addresses: ccAddresses,
      subject,
      text_body: text || null,
      html_body: html || null,
      direction: 'inbound',
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
