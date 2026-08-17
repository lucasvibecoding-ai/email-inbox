import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from './accounts';
import { getAccounts } from './accounts';
import type { Email } from './types';
import { sendReply } from './send';

/**
 * A static "we got your email" acknowledgement, sent once per new
 * conversation. Not AI generated: the text below is fixed.
 *
 * The dangerous failure mode is mailing the backlog. There are ~1000 old
 * inbound emails with no ai_status, every one of them with a null
 * in_reply_to, so they all look like first contact. If the sweep ever
 * acknowledged what it triages, it would mail all of them at once. Two
 * independent guards prevent that: callers must opt in with allowAck (only
 * the live webhook does), and an email older than MAX_AGE_MINUTES is never
 * acknowledged even then.
 */
const MAX_AGE_MINUTES = 60;

/** Don't acknowledge the same person twice in this window, across threads. */
const PER_SENDER_QUIET_HOURS = 6;

/** Machine senders. Replying to these is how mail loops start. */
const AUTOMATED_SENDER =
  /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|notification|notifications|alert|alerts|automated|auto-confirm)@/i;

/** Bounces and out-of-office replies, which are themselves automated. */
const AUTOMATED_SUBJECT =
  /^\s*(re:\s*)?(out of office|automatic reply|auto[- ]?reply|autoreply|automatic response|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|read receipt|abwesenheit|réponse automatique)/i;

export interface AckDecision {
  send: boolean;
  reason: string;
}

function firstName(fromName: string | null): string | null {
  const n = (fromName || '').trim();
  if (!n || n.includes('@')) return null;
  const first = n.split(/\s+/)[0].replace(/[",]/g, '').trim();
  return first.length > 1 ? first : null;
}

function personFirstName(account: Account): string {
  const full = account.senderName.split(/\s+[-–—]\s+/)[0].trim();
  return full.split(/\s+/)[0] || full;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function ackBody(email: Email, account: Account): { text: string; html: string } {
  const who = firstName(email.from_name);
  const text = [
    who ? `Hi ${who},` : 'Hi there,',
    'thanks for the email.',
    '',
    'This is just a quick note to let you know your message arrived safely.',
    '',
    'I read every email myself, so this one is with me now and I will get back to you as soon as I can, usually within one business day.',
    '',
    'Best regards,',
    personFirstName(account),
  ].join('\n');
  const html = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(
    text,
  ).replace(/\n/g, '<br>')}</div>`;
  return { text, html };
}

/**
 * Everything that can be judged from the email row alone, with no DB access.
 * Kept pure so the rules are easy to read and to test.
 */
export function ackEligibility(
  email: Email,
  account: Account,
  category: string | null,
  opts: { allowAck: boolean; now?: number },
): AckDecision {
  if (!opts.allowAck) return { send: false, reason: 'caller did not allow acks (sweep/backfill)' };
  if (email.direction !== 'inbound') return { send: false, reason: 'not inbound' };
  if (category === 'spam') return { send: false, reason: 'spam' };
  if (email.is_trash) return { send: false, reason: 'trashed' };

  // A reply belongs to a conversation already under way.
  if (email.in_reply_to) return { send: false, reason: 'is a reply (in_reply_to set)' };
  if (email.references && email.references.length > 0) {
    return { send: false, reason: 'is a reply (references set)' };
  }

  const ageMin = ((opts.now ?? Date.now()) - new Date(email.created_at).getTime()) / 60000;
  if (!(ageMin < MAX_AGE_MINUTES)) {
    return { send: false, reason: `too old to acknowledge (${Math.round(ageMin)} min)` };
  }

  const from = (email.from_address || '').toLowerCase().trim();
  if (!from || !from.includes('@')) return { send: false, reason: 'no usable from address' };
  if (AUTOMATED_SENDER.test(from)) return { send: false, reason: 'automated sender address' };
  if (AUTOMATED_SUBJECT.test(email.subject || '')) {
    return { send: false, reason: 'automated subject (bounce or out of office)' };
  }
  // Never reply to ourselves: two of our own inboxes would ping-pong forever.
  if (getAccounts().some((a) => a.email.toLowerCase() === from)) {
    return { send: false, reason: 'sender is one of our own accounts' };
  }

  return { send: true, reason: 'eligible' };
}

/**
 * Send the acknowledgement if this email qualifies. Never throws: a failed
 * acknowledgement must not fail triage. Returns the outbound row id, or null.
 */
export async function maybeSendAck(
  supabase: SupabaseClient,
  email: Email,
  account: Account,
  category: string | null,
  opts: { allowAck: boolean },
): Promise<string | null> {
  try {
    const verdict = ackEligibility(email, account, category, opts);
    if (!verdict.send) return null;

    // Anything already sent in this thread means the conversation is handled,
    // including an acknowledgement we sent a moment ago.
    if (email.thread_id) {
      const { data: prior } = await supabase
        .from('emails')
        .select('id')
        .eq('thread_id', email.thread_id)
        .eq('direction', 'outbound')
        .limit(1);
      if (prior && prior.length) return null;
    }

    // Quiet period per sender, so a burst of separate emails gets one ack.
    const since = new Date(Date.now() - PER_SENDER_QUIET_HOURS * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('emails')
      .select('id')
      .eq('direction', 'outbound')
      .contains('to_addresses', [email.from_address])
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length) return null;

    const { text, html } = ackBody(email, account);
    const subject = email.subject?.trim()
      ? /^re:/i.test(email.subject.trim())
        ? email.subject.trim()
        : `Re: ${email.subject.trim()}`
      : 'Re: your email';

    return await sendReply(supabase, account, {
      to: email.from_address,
      subject,
      text,
      html,
      inReplyTo: email.message_id,
      references: email.message_id ? [email.message_id] : null,
    });
  } catch (err) {
    console.error('Auto-ack failed for email', email.id, err);
    return null;
  }
}
