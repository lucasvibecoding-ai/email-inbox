import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from './accounts';
import type { Email } from './types';
import { getVoiceGuide, getPlatformFacts, getBrief } from './knowledge';
import { getAutoSend } from './settings';
import { sendReply } from './send';

export type TriageCategory =
  | 'access_help'
  | 'presale_question'
  | 'refund'
  | 'payment_issue'
  | 'complaint'
  | 'receipt'
  | 'spam'
  | 'other';

const CATEGORIES: TriageCategory[] = [
  'access_help',
  'presale_question',
  'refund',
  'payment_issue',
  'complaint',
  'receipt',
  'spam',
  'other',
];

export interface TriageResult {
  category: TriageCategory;
  needs_human: boolean;
  confidence: number;
  reason: string;
  draft_reply: string;
}

export type AiStatus = 'needs_human' | 'auto_replied' | 'no_reply_needed' | 'error';

// A real past (customer email -> owner reply) pair, used to teach the AI how the
// owner handles situations, not just how they write.
export interface StyleExample {
  subject: string | null;
  customer: string;
  reply: string;
}

// A prior message in the same thread as the email being triaged.
export interface ThreadMessage {
  role: 'customer' | 'owner';
  text: string;
}

// --- Auto-send policy ------------------------------------------------------
// The auto-send master switch lives in the DB (app_settings, toggled from the
// Master View) and defaults to OFF. When ON, an email is auto-sent only if the
// AI is confident, did not flag it for a human, and it is one of these safe
// categories. refund / payment_issue / complaint can never auto-send.
const AUTO_SEND_CATEGORIES: TriageCategory[] = ['access_help', 'presale_question'];
const NEVER_AUTO_SEND: TriageCategory[] = ['refund', 'payment_issue', 'complaint'];
const CONFIDENCE_THRESHOLD = 0.85;

const MODEL = 'claude-haiku-4-5';

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const TRIAGE_TOOL_SCHEMA: Anthropic.Tool['input_schema'] = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: CATEGORIES,
      description:
        'access_help = how to log in / access after purchase (not a genuine failure). presale_question = a question before buying. refund = any refund or cancellation. payment_issue = double or failed charge, chargeback, wrong amount or currency. complaint = dissatisfaction, dispute, or emotional. receipt = invoice / receipt / VAT / tax request, or an automated receipt. spam = spam, marketing, phishing, or unrelated. other = anything else.',
    },
    needs_human: {
      type: 'boolean',
      description:
        'true when a human must handle it (money, a decision, an action you cannot take, or you are not confident). Always true for refund, payment_issue, and complaint.',
    },
    confidence: {
      type: 'number',
      description:
        'From 0.0 to 1.0: how confident you are that draft_reply is correct and safe to send as-is.',
    },
    reason: {
      type: 'string',
      description: 'One short sentence explaining the category and the needs_human decision.',
    },
    draft_reply: {
      type: 'string',
      description:
        "The reply to the customer, written in Aiko Mori's voice per the VOICE GUIDE. Use an empty string for spam.",
    },
  },
  required: ['category', 'needs_human', 'confidence', 'reason', 'draft_reply'],
};

function stripQuote(text: string | null): string {
  return String(text || '').split(/---+\s*On /)[0].trim();
}

function systemPrompt(
  account: Account,
  examples: StyleExample[],
  thread: ThreadMessage[],
): string {
  const brief = getBrief(account.id);
  const briefBlock = brief
    ? brief
    : 'No course brief is available for this address. Escalate everything to a human (needs_human = true) and do not attempt a substantive answer.';
  const lines = [
    `You are the customer-support assistant for the online course "${account.displayName}". You reply to emails sent to ${account.email}, writing AS the course's support persona (Aiko Mori). For each incoming email you do two things: (1) triage it into a category, and (2) draft a reply. You MUST call the record_triage tool with your result.`,
    '',
    '## Grounding and safety (critical)',
    '- Use ONLY facts in the COURSE BRIEF, PLATFORM FACTS, and VOICE GUIDE below. Never invent prices, dates, policies, URLs, order details, or account specifics.',
    '- If you are not confident, or the email needs an action you cannot take (issuing a refund, granting or fixing access, changing an order or the purchase email), set needs_human = true.',
    '- refund, payment_issue, and complaint ALWAYS get needs_human = true. You may state a policy warmly, but never promise, process, or confirm a refund, and never confirm an account or access change.',
    '- If a customer asks whether a discount, sale, countdown, or number of spots is still available or expiring, set needs_human = true. You may state the current price if the brief gives it, but never make claims about timers, deadlines, or remaining availability.',
    '- Never state anything a brief marks NEEDS INPUT or flags as inconsistent. Escalate instead.',
    '',
    '## The draft reply (fixed format)',
    '- REQUIRED opening. Begin every reply with these two lines, using the sender first name from the From line:',
    '    Hi [First name],',
    '    thanks for the email.',
    '  If no sender name is available, use "Hi there," as the first line. This opening is fixed and overrides any greeting in the VOICE GUIDE.',
    '- REQUIRED closing. End every reply with exactly these two lines:',
    '    Best regards,',
    '    Aiko',
    '  This sign-off is fixed and overrides any sign-off in the VOICE GUIDE.',
    '- Between the opening and the closing, answer in the persona voice (see VOICE GUIDE): warm, first person, short paragraphs.',
    '- Never use a dash or hyphen of any kind (the characters —, –, or -) as punctuation or in ordinary wording. Write compound terms as separate words instead (for example: step by step, self paced, one time, sign in). Keep the hyphen ONLY in: literal strings you must quote exactly (the login URL, an email address, an exact subject line) and proper names whose standard spelling includes a hyphen (for example sumi-e).',
    '- For safe categories (access_help, presale_question), write a complete, helpful answer grounded in the brief.',
    '- For refund, payment_issue, complaint, and any needs_human case: write a warm holding reply that acknowledges the customer and reassures them you are looking into it and will follow up. Do NOT commit to any outcome, amount, timeline, or fact not in the brief.',
    '- For spam, set draft_reply to an empty string.',
    '',
    '## COURSE BRIEF',
    briefBlock,
    '',
    '## PLATFORM FACTS',
    getPlatformFacts(),
    '',
    '## VOICE GUIDE',
    getVoiceGuide(),
  ];

  if (examples.length) {
    lines.push(
      '',
      '## HOW THE OWNER HANDLES EMAILS (real past email + reply pairs, most relevant first)',
      'Each pair below is a real customer email and the reply the account owner actually sent, chosen because it resembles the email you are answering now. Learn BOTH how the owner writes AND how they handle this kind of situation, and draft in the same way. Still ALWAYS keep the required opening, the required closing, and the no-dash rule from above.',
    );
    examples.forEach((ex, i) => {
      lines.push(
        `--- Example ${i + 1}${ex.subject ? ` (re: ${ex.subject})` : ''} ---`,
        ex.customer ? `Customer wrote:\n${ex.customer}` : 'Customer wrote: (original not on file)',
        `The owner replied:\n${ex.reply}`,
      );
    });
  }

  if (thread.length) {
    lines.push(
      '',
      '## THIS CONVERSATION SO FAR (earlier messages in this same thread)',
      'You and the customer have already exchanged messages in this thread. Write your draft as a continuation: do not repeat what the owner already said, do not contradict it, and address the customer\'s latest message specifically.',
    );
    thread.forEach((m) => {
      lines.push(`--- ${m.role === 'owner' ? 'Owner (Aiko)' : 'Customer'} ---`, m.text);
    });
  }

  return lines.join('\n');
}

function normalize(input: unknown): TriageResult {
  const o = (input ?? {}) as Record<string, unknown>;
  const category = CATEGORIES.includes(o.category as TriageCategory)
    ? (o.category as TriageCategory)
    : 'other';
  let confidence = typeof o.confidence === 'number' ? o.confidence : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    category,
    // Default to the safe side (needs a human) unless explicitly false.
    needs_human: o.needs_human !== false,
    confidence,
    reason: typeof o.reason === 'string' ? o.reason : '',
    draft_reply: sanitizeDashes(typeof o.draft_reply === 'string' ? o.draft_reply : ''),
  };
}

export async function triageEmail(params: {
  account: Account;
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  textBody: string | null;
  styleExamples?: StyleExample[];
  threadContext?: ThreadMessage[];
}): Promise<TriageResult> {
  const from = params.fromName
    ? `${params.fromName} <${params.fromAddress}>`
    : params.fromAddress;
  const body = (params.textBody || '').slice(0, 8000) || '(empty body)';
  const userMessage = `From: ${from}\nSubject: ${params.subject || '(no subject)'}\n\n${body}`;

  const resp = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt(params.account, params.styleExamples || [], params.threadContext || []),
    messages: [{ role: 'user', content: userMessage }],
    tools: [
      {
        name: 'record_triage',
        description: 'Record the triage classification and the drafted reply for this email.',
        input_schema: TRIAGE_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'record_triage' },
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('Triage model did not return a tool call');
  return normalize(toolUse.input);
}

/** Map a triage result to the stored ai_status, honoring the auto-send policy. */
export function computeStatus(r: TriageResult, autoSendEnabled: boolean): AiStatus {
  if (r.category === 'spam') return 'no_reply_needed';
  if (r.category === 'receipt' && !r.needs_human) return 'no_reply_needed';
  const autoSafe =
    autoSendEnabled &&
    !r.needs_human &&
    r.confidence >= CONFIDENCE_THRESHOLD &&
    AUTO_SEND_CATEGORIES.includes(r.category) &&
    !NEVER_AUTO_SEND.includes(r.category);
  return autoSafe ? 'auto_replied' : 'needs_human';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Hard guarantee of the "never use a dash or hyphen" rule on generated drafts.
// em/en dashes become a comma; compound hyphens become a space, token by token,
// while URLs, email addresses, and the proper noun sumi-e keep their hyphen.
function sanitizeDashes(text: string): string {
  const t = text.replace(/\s*[—–]\s*/g, ', ');
  return t.replace(/\S+/g, (tok) =>
    /^https?:\/\//i.test(tok) || tok.includes('@') || /sumi-e/i.test(tok)
      ? tok
      : tok.replace(/-/g, ' '),
  );
}

/** All emails in the same thread as `email`, oldest first. */
async function getThread(supabase: SupabaseClient, email: Email): Promise<Email[]> {
  if (!email.thread_id) return [];
  const { data } = await supabase
    .from('emails')
    .select('*')
    .eq('thread_id', email.thread_id)
    .order('created_at', { ascending: true });
  return (data || []) as Email[];
}

/** Was this inbound email already replied to by the owner in its thread? */
function findExistingOwnerReply(thread: Email[], email: Email): Email | null {
  const t = new Date(email.created_at).getTime();
  return (
    thread.find(
      (m) =>
        m.id !== email.id &&
        m.direction === 'outbound' &&
        (m.in_reply_to === email.message_id ||
          new Date(m.created_at).getTime() > t),
    ) || null
  );
}

/** Recent real (customer email -> owner reply) pairs, oldest fallback when no
 *  relevant match is found. */
export async function getStyleExamples(
  supabase: SupabaseClient,
  limit = 6,
): Promise<StyleExample[]> {
  const { data: replies, error } = await supabase
    .from('emails')
    .select('subject, text_body, in_reply_to')
    .eq('direction', 'outbound')
    .not('in_reply_to', 'is', null)
    .not('text_body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !replies) return [];

  const inReplyToIds = replies.map((r) => r.in_reply_to).filter(Boolean) as string[];
  const originalByMid = new Map<string, string>();
  if (inReplyToIds.length) {
    const { data: originals } = await supabase
      .from('emails')
      .select('message_id, text_body')
      .in('message_id', inReplyToIds);
    for (const o of originals || []) {
      if (o.message_id) originalByMid.set(o.message_id, o.text_body || '');
    }
  }

  return replies
    .map((r) => ({
      subject: (r.subject as string | null) ?? null,
      customer: stripQuote(originalByMid.get(r.in_reply_to as string) || '').slice(0, 500),
      reply: stripQuote(r.text_body).slice(0, 700),
    }))
    .filter((p) => p.reply.length > 0);
}

const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'have', 'this', 'that', 'from', 'are', 'was', 'not',
  'but', 'can', 'all', 'get', 'got', 'has', 'how', 'out', 'use', 'one', 'two', 'course', 'courses',
  'email', 'hello', 'aiko', 'mori', 'please', 'thanks', 'thank', 'would', 'could', 'there', 'here',
  'just', 'been', 'they', 'them', 'then', 'than', 'some', 'what', 'when', 'which', 'about', 'after',
  'also', 'into', 'over', 'only', 'very', 'will', 'well', 'need', 'want', 'know', 'like', 'time',
  'make', 'made', 'send', 'sent', 'see', 'saw', 'did', 'done', 'now', 'yet', 'any', 'our', 'let',
  'com', 'www', 'purchased', 'purchase', 'paid', 'pay', 'payment', 'payments', 'bought', 'buy',
  'order', 'ordered', 'received', 'receive', 'day', 'days', 'ago', 'address', 'dollars', 'request',
  'realize', 'expected', 'look', 'looking', 'through', 'extra', 'statement', 'shows', 'think',
  'same', 'separate', 'accidentally', 'mandala', 'sumi', 'shibori', 'watercolor', 'palette', 'knife',
  'doodle', 'ink', 'cat', 'cats', 'visual', 'notes', 'note', 'class', 'masterclass', 'tell', 'tells',
  'told', 'never', 'either', 'cannot', 'every', 'way', 'try', 'tried', 'its', 'had', 'put', 'say',
  'said', 'ask', 'may', 'might', 'still', 'under', 'again', 'really', 'something', 'anything',
  'someone', 'thing', 'things', 'much', 'many', 'more', 'most', 'other', 'another', 'because',
  'since', 'while', 'where', 'who', 'whose', 'why', 'update', 'updated', 'version', 'wait', 'help',
  'using', 'back',
]);

function extractKeywords(text: string): string[] {
  const words = String(text || '').toLowerCase().match(/[a-z]{3,}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (KEYWORD_STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out.slice(0, 10);
}

/** Semantic-ish memory: the most relevant past (customer email -> owner reply)
 *  pairs from the FULL history, matched by keyword relevance (Postgres text
 *  search) and ranked by how many query keywords appear. No embeddings needed. */
export async function getRelevantExamples(
  supabase: SupabaseClient,
  queryText: string,
  limit = 6,
): Promise<StyleExample[]> {
  const keywords = extractKeywords(queryText);
  if (keywords.length === 0) return [];
  const ftsQuery = keywords.join(' OR ');

  const { data: inbounds, error } = await supabase
    .from('emails')
    .select('message_id, text_body, subject')
    .eq('direction', 'inbound')
    .not('text_body', 'is', null)
    .not('message_id', 'is', null)
    .textSearch('text_body', ftsQuery, { type: 'websearch', config: 'english' })
    .limit(50);
  if (error || !inbounds || inbounds.length === 0) return [];

  const mids = inbounds.map((i) => i.message_id).filter(Boolean) as string[];
  const { data: replies } = await supabase
    .from('emails')
    .select('in_reply_to, text_body, subject')
    .eq('direction', 'outbound')
    .not('text_body', 'is', null)
    .in('in_reply_to', mids);

  const replyByMid = new Map<string, { text: string; subject: string | null }>();
  for (const r of replies || []) {
    const key = r.in_reply_to as string | null;
    if (key && !replyByMid.has(key)) {
      replyByMid.set(key, { text: r.text_body || '', subject: (r.subject as string | null) ?? null });
    }
  }

  return inbounds
    .filter((i) => i.message_id && replyByMid.has(i.message_id))
    .map((i) => {
      const customer = stripQuote(i.text_body);
      const rep = replyByMid.get(i.message_id as string) as { text: string; subject: string | null };
      const hay = customer.toLowerCase();
      const score = keywords.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
      return {
        score,
        example: {
          subject: rep.subject ?? ((i.subject as string | null) ?? null),
          customer: customer.slice(0, 500),
          reply: stripQuote(rep.text).slice(0, 700),
        } as StyleExample,
      };
    })
    .filter((p) => p.example.reply.length > 0 && p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => p.example);
}

/** Triage one inbound email, then either auto-send (if enabled + safe) or
 *  leave a draft. Writes the ai_* fields back to the row either way. */
export async function runTriageForEmail(
  supabase: SupabaseClient,
  email: Email,
  account: Account,
): Promise<void> {
  try {
    // First, look through the DB: if the owner already replied to this email in
    // its thread, there is nothing to draft. Mark it replied and stop.
    const thread = await getThread(supabase, email);
    const existingReply = findExistingOwnerReply(thread, email);
    if (existingReply) {
      await supabase
        .from('emails')
        .update({
          ai_status: 'auto_replied',
          ai_reason: 'You already replied to this in the thread.',
          ai_draft: stripQuote(existingReply.text_body).slice(0, 4000) || null,
          ai_reply_email_id: existingReply.id,
          ai_processed_at: new Date().toISOString(),
        })
        .eq('id', email.id);
      return;
    }

    // Earlier messages in this thread (context for a follow-up).
    const currentTime = new Date(email.created_at).getTime();
    const threadContext: ThreadMessage[] = thread
      .filter((m) => m.id !== email.id && new Date(m.created_at).getTime() <= currentTime)
      .map((m) => ({
        role: m.direction === 'outbound' ? ('owner' as const) : ('customer' as const),
        text: stripQuote(m.text_body).slice(0, 600),
      }))
      .filter((m) => m.text.length > 0)
      .slice(-6);

    // Semantic-ish memory: pull the most relevant past pairs from the full
    // history, then fill with recent replies so there is always some style.
    const relevant = await getRelevantExamples(
      supabase,
      `${email.subject || ''} ${email.text_body || ''}`,
    );
    const styleExamples: StyleExample[] = [...relevant];
    if (styleExamples.length < 3) {
      const recent = await getStyleExamples(supabase);
      const seen = new Set(styleExamples.map((e) => e.reply));
      for (const r of recent) {
        if (styleExamples.length >= 6) break;
        if (!seen.has(r.reply)) {
          styleExamples.push(r);
          seen.add(r.reply);
        }
      }
    }

    const result = await triageEmail({
      account,
      fromName: email.from_name,
      fromAddress: email.from_address,
      subject: email.subject,
      textBody: email.text_body,
      styleExamples,
      threadContext,
    });
    const autoSendEnabled = await getAutoSend(supabase);
    const status = computeStatus(result, autoSendEnabled);

    const baseFields = {
      ai_category: result.category,
      ai_confidence: result.confidence,
      ai_draft: result.draft_reply || null,
      ai_reason: result.reason || null,
      ai_processed_at: new Date().toISOString(),
    };

    if (status === 'auto_replied') {
      try {
        const refs = [...(email.references || []), email.message_id].filter(
          (v): v is string => Boolean(v),
        );
        const subject = email.subject?.startsWith('Re:')
          ? email.subject
          : `Re: ${email.subject || ''}`;
        const html = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(result.draft_reply).replace(/\n/g, '<br>')}</div>`;
        const outboundId = await sendReply(supabase, account, {
          to: email.from_address,
          subject,
          text: result.draft_reply,
          html,
          inReplyTo: email.message_id,
          references: refs.length ? refs : null,
        });
        await supabase
          .from('emails')
          .update({ ...baseFields, ai_status: 'auto_replied', ai_reply_email_id: outboundId })
          .eq('id', email.id);
        return;
      } catch (sendErr) {
        // If the auto-send fails, keep the draft and hand it to a human.
        console.error('Auto-send failed for email', email.id, sendErr);
        await supabase
          .from('emails')
          .update({
            ...baseFields,
            ai_status: 'needs_human',
            ai_reason: `${result.reason || ''} [auto-send failed: ${(sendErr instanceof Error ? sendErr.message : 'error').slice(0, 150)}]`,
          })
          .eq('id', email.id);
        return;
      }
    }

    await supabase
      .from('emails')
      .update({ ...baseFields, ai_status: status })
      .eq('id', email.id);
  } catch (err) {
    console.error('Triage failed for email', email.id, err);
    await supabase
      .from('emails')
      .update({
        ai_status: 'error',
        ai_reason: (err instanceof Error ? err.message : 'triage error').slice(0, 300),
        ai_processed_at: new Date().toISOString(),
      })
      .eq('id', email.id);
  }
}
