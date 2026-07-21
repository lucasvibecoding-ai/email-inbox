import { NextRequest, NextResponse } from 'next/server';
import { notifyNeedsYou } from '@/lib/notify';
import { getAccounts } from '@/lib/accounts';

export const runtime = 'nodejs';

// POST /api/notify/test?key=SECRET — send a sample Telegram alert to confirm the
// TELEGRAM_* env vars are wired in production. Gated by TRIAGE_SWEEP_SECRET.
export async function POST(req: NextRequest) {
  const secret = process.env.TRIAGE_SWEEP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Disabled. Set TRIAGE_SWEEP_SECRET.' }, { status: 403 });
  }
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.nextUrl.searchParams.get('key');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasChat = !!process.env.TELEGRAM_CHAT_ID;
  if (!hasToken || !hasChat) {
    return NextResponse.json({
      ok: false,
      hasToken,
      hasChat,
      note: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel, then redeploy.',
    });
  }

  const account = getAccounts()[0];
  await notifyNeedsYou({
    account,
    fromName: 'Test Sender',
    fromAddress: 'test@example.com',
    subject: 'Test notification from your inbox',
    body:
      'This is a test alert to confirm phone notifications are wired up in production. ' +
      'If you see this in Telegram, every new email that lands in "Needs you" will ping you like this.',
    category: 'presale_question',
    reason: 'Test ping',
  });
  return NextResponse.json({ ok: true, hasToken, hasChat, note: 'Sent. Check your phone.' });
}
