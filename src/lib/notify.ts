import type { Account } from './accounts';

// Where the "Open in inbox" button points.
const MASTER_URL = 'https://email-inbox-kohl.vercel.app/master';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Show only the customer's newest message, not the quoted reply history.
function firstMessage(body: string): string {
  return String(body || '').split(/---+\s*On /)[0].trim();
}

export interface NeedsYouAlert {
  account: Account;
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  body: string | null;
  category?: string | null;
  reason?: string | null;
  attachments?: { filename: string | null }[];
}

/** Push a Telegram alert for an email that just landed in "Needs you". Best
 *  effort: returns quietly if Telegram is not configured, and never throws so a
 *  notification failure can never break triage. */
export async function notifyNeedsYou(a: NeedsYouAlert): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const from = (a.fromName ? `${a.fromName} <${a.fromAddress}>` : a.fromAddress).slice(0, 200);
    const subject = (a.subject || '(no subject)').slice(0, 250);
    const msg = firstMessage(a.body || '');
    const trimmed = msg.length > 1500 ? msg.slice(0, 1500) + '…' : msg;

    // Only the <b> header labels carry HTML tags, and they always sit at the top
    // of the message; everything below is escaped plain text. That keeps the
    // length-trim at the bottom from ever cutting a tag in half.
    const lines = [
      `🔔 <b>Needs you · ${escapeHtml(a.account.displayName)}</b>`,
      `<b>From:</b> ${escapeHtml(from)}`,
      `<b>Subject:</b> ${escapeHtml(subject)}`,
      '',
      escapeHtml(trimmed || '(no message body)'),
    ];

    const names = (a.attachments || [])
      .map((x) => x.filename)
      .filter(Boolean)
      .map(String);
    if (names.length) {
      lines.push(
        '',
        `📎 ${names.length} attachment${names.length > 1 ? 's' : ''}: ${escapeHtml(names.join(', ').slice(0, 300))}`,
      );
    }

    const meta = [a.category, a.reason].filter(Boolean).map(String).join(' · ').slice(0, 250);
    if (meta) lines.push('', `🤖 ${escapeHtml(meta)}`);

    let text = lines.join('\n');
    if (text.length > 4000) {
      // Trim to Telegram's 4096 limit without leaving a half-written entity.
      text = text.slice(0, 4000).replace(/&[^;]{0,6}$/, '') + '…';
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: 'Open in inbox', url: MASTER_URL }]] },
      }),
    });
    if (!res.ok) {
      console.error('Telegram sendMessage failed', res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.error('notifyNeedsYou failed', err);
  }
}
