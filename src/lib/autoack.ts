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

/**
 * Reply and forward prefixes, across the languages this mailbox actually sees.
 * Re/Res, Fw/Fwd, German Aw/Antwort, French Rép, Italian Rif, Spanish Rv.
 */
const REPLY_SUBJECT = /^\s*(re|res|fw|fwd|aw|antwort|rép|rep|rif|rv)\s*(\[\d+\])?\s*:/i;

/** Subject with every reply/forward prefix stripped, for matching. */
export function normalizeSubject(subject: string | null): string {
  let s = (subject || '').trim();
  // Strip repeatedly: "Re: Fwd: Re: x" is still about x.
  for (let i = 0; i < 6 && REPLY_SUBJECT.test(s); i++) {
    s = s.replace(REPLY_SUBJECT, '').trim();
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
}

export interface AckDecision {
  send: boolean;
  reason: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The acknowledgement text. Fixed for every account and every sender: no
 * recipient name in the greeting and no sign-off, so it reads as a short
 * automatic receipt rather than a personal reply. The persona is still
 * visible to the recipient in the From line.
 */
export function ackBody(): { text: string; html: string } {
  const text = [
    'Hi,',
    'thanks for the email.',
    '',
    'This is just a quick note to let you know your message arrived safely.',
    '',
    'I read every email myself, so this one is with me now and I will get back to you as soon as I can, usually within one business day.',
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
  //
  // The header fields are checked first but cannot be relied on: the inbound
  // webhook has no In-Reply-To to store, so every incoming email has a null
  // here and a customer's reply looks exactly like first contact. The subject
  // prefix is what actually catches replies today.
  if (email.in_reply_to) return { send: false, reason: 'is a reply (in_reply_to set)' };
  if (email.references && email.references.length > 0) {
    return { send: false, reason: 'is a reply (references set)' };
  }
  if (REPLY_SUBJECT.test(email.subject || '')) {
    return { send: false, reason: 'is a reply (subject prefix)' };
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

    // Deliberately NOT keyed on thread_id: inbound mail never joins a thread
    // (see the note in ackEligibility), so a thread lookup would say "new
    // conversation" every single time.
    const [{ data: fromThem }, { data: toThem }] = await Promise.all([
      supabase
        .from('emails')
        .select('id,subject,to_addresses,created_at')
        .eq('direction', 'inbound')
        .eq('from_address', email.from_address)
        .neq('id', email.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('emails')
        .select('id,subject,from_address,created_at')
        .eq('direction', 'outbound')
        .contains('to_addresses', [email.from_address])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const inbox = account.email.toLowerCase();
    const priorInbound = (fromThem || []).filter((m) =>
      (m.to_addresses || []).some((a: string) => a?.toLowerCase() === inbox),
    );
    const priorOutbound = (toThem || []).filter(
      (m) => (m.from_address || '').toLowerCase() === inbox,
    );

    // Same conversation, continued: they wrote or we wrote under this subject
    // before, so it is not a new enquiry even without the headers to prove it.
    const thisSubject = normalizeSubject(email.subject);
    if (
      thisSubject &&
      [...priorInbound, ...priorOutbound].some(
        (m) => normalizeSubject(m.subject as string | null) === thisSubject,
      )
    ) {
      return null;
    }

    // Burst protection: anything already sent to this person recently, an
    // acknowledgement or a real reply, means they do not need another note.
    const cutoff = Date.now() - PER_SENDER_QUIET_HOURS * 3600_000;
    if (priorOutbound.some((m) => Date.parse(m.created_at as string) >= cutoff)) return null;
    if (
      priorInbound.some(
        (m) =>
          Date.parse(m.created_at as string) >= cutoff &&
          Date.parse(m.created_at as string) < Date.parse(email.created_at),
      )
    ) {
      return null;
    }

    const { text, html } = ackBody();
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
