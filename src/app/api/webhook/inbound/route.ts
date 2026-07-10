import { NextRequest, NextResponse, after } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccountByEmail, getAccounts } from '@/lib/accounts';
import { runTriageForEmail } from '@/lib/triage';
import { Email } from '@/lib/types';
import { Webhook } from 'svix';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify webhook signature — try both secrets since each domain has its own
    const secrets = [
      process.env.WEBHOOK_SECRET_SHIBORICLASS,
      process.env.WEBHOOK_SECRET_SUMIECLASS,
      process.env.WEBHOOK_SECRET_SUMINAGASHICLASS,
      process.env.WEBHOOK_SECRET_MANDALAPRACTICE,
      process.env.WEBHOOK_SECRET_WATERCOLORFASHION,
      process.env.WEBHOOK_SECRET_VISUALNOTESCLASS,
      process.env.WEBHOOK_SECRET_PALETTEKNIFECLASS,
      process.env.WEBHOOK_SECRET_JAPANESEDOODLECLASS,
      process.env.WEBHOOK_SECRET_INKCATCLASS,
    ].filter(Boolean) as string[];

    if (secrets.length > 0) {
      const headers = {
        'svix-id': req.headers.get('svix-id') || '',
        'svix-timestamp': req.headers.get('svix-timestamp') || '',
        'svix-signature': req.headers.get('svix-signature') || '',
      };
      const verified = secrets.some((s) => {
        try {
          new Webhook(s).verify(rawBody, headers);
          return true;
        } catch {
          return false;
        }
      });
      if (!verified) {
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

    // Determine which account this email is for
    const toAddresses = Array.isArray(to) ? to : [to].filter(Boolean);
    const matchedAccount =
      toAddresses.map((addr: string) => getAccountByEmail(addr)).find(Boolean) || null;
    // Fall back to the first account only for fetching the message body from Resend.
    const account = matchedAccount || getAccounts()[0];

    // Webhook doesn't include body — fetch full email from Resend API
    let text = '';
    let html = '';

    if (emailId) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: `Bearer ${account.resendApiKey}` },
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

    const ccAddresses = cc?.length ? cc : null;

    const { data: inserted, error } = await supabase
      .from('emails')
      .insert({
        message_id: payload.message_id || emailId || `inbound-${Date.now()}`,
        from_address: fromEmail,
        from_name: fromName,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        subject,
        text_body: text || null,
        html_body: html || null,
        direction: 'inbound',
      })
      .select()
      .single();

    if (error) {
      console.error('DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Triage the new email with AI after the 200 response is sent (draft-only).
    // Only when we can map the recipient to a known course account.
    if (matchedAccount && inserted) {
      after(() => runTriageForEmail(supabase, inserted as Email, matchedAccount));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
