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

export interface StyleExample {
  subject: string | null;
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

function systemPrompt(account: Account, examples: StyleExample[]): string {
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
      '## HOW THE ACCOUNT OWNER ACTUALLY WRITES (real recent replies to learn from)',
      'The replies below are real messages the account owner recently sent to customers. Study their tone, word choice, warmth, rhythm, and how they handle situations, and make your draft sound like the same person wrote it. This is your best and most current guide to their real voice. Still ALWAYS keep the required opening, the required closing, and the no-dash rule from above, regardless of what these examples show.',
      ...examples.map(
        (ex, i) => `--- Example ${i + 1}${ex.subject ? ` (re: ${ex.subject})` : ''} ---\n${ex.text}`,
      ),
    );
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
}): Promise<TriageResult> {
  const from = params.fromName
    ? `${params.fromName} <${params.fromAddress}>`
    : params.fromAddress;
  const body = (params.textBody || '').slice(0, 8000) || '(empty body)';
  const userMessage = `From: ${from}\nSubject: ${params.subject || '(no subject)'}\n\n${body}`;

  const resp = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt(params.account, params.styleExamples || []),
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

/** Recent real replies the owner sent, used as live voice examples in the
 *  draft prompt so the AI learns to mimic how the owner writes. */
export async function getStyleExamples(
  supabase: SupabaseClient,
  limit = 6,
): Promise<StyleExample[]> {
  const { data, error } = await supabase
    .from('emails')
    .select('subject, text_body')
    .eq('direction', 'outbound')
    .not('in_reply_to', 'is', null)
    .not('text_body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || [])
    .map((e) => ({
      subject: (e.subject as string | null) ?? null,
      // Drop any quoted-original block so we learn only what the owner wrote.
      text: String(e.text_body || '')
        .split(/---+\s*On /)[0]
        .trim()
        .slice(0, 900),
    }))
    .filter((e) => e.text.length > 0);
}

/** Triage one inbound email, then either auto-send (if enabled + safe) or
 *  leave a draft. Writes the ai_* fields back to the row either way. */
export async function runTriageForEmail(
  supabase: SupabaseClient,
  email: Email,
  account: Account,
): Promise<void> {
  try {
    const styleExamples = await getStyleExamples(supabase);
    const result = await triageEmail({
      account,
      fromName: email.from_name,
      fromAddress: email.from_address,
      subject: email.subject,
      textBody: email.text_body,
      styleExamples,
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
