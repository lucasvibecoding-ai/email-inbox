import type { SupabaseClient } from '@supabase/supabase-js';
import { Account, getResendClient } from './accounts';

// Send a reply as the given account via Resend and record it as an outbound
// email. Returns the new outbound row id (or null). Shared by the auto-send
// path in triage; throws if Resend rejects the send.
export async function sendReply(
  supabase: SupabaseClient,
  account: Account,
  params: {
    to: string;
    subject: string;
    text: string;
    html: string;
    inReplyTo?: string | null;
    references?: string[] | null;
  },
): Promise<string | null> {
  const resend = getResendClient(account);
  const from = `${account.senderName} <${account.email}>`;

  const headers: Record<string, string> = {};
  if (params.inReplyTo) headers['In-Reply-To'] = params.inReplyTo;
  if (params.references?.length) headers['References'] = params.references.join(' ');

  const result = await resend.emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (result.error) throw new Error(result.error.message);

  const { data: outbound } = await supabase
    .from('emails')
    .insert({
      message_id: result.data?.id || `sent-${Date.now()}`,
      from_address: account.email,
      from_name: account.senderName,
      to_addresses: [params.to],
      subject: params.subject,
      text_body: params.text || null,
      html_body: params.html || null,
      direction: 'outbound',
      is_read: true,
      in_reply_to: params.inReplyTo || null,
      references: params.references || null,
    })
    .select('id')
    .single();

  return outbound?.id ?? null;
}
