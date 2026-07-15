import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccounts } from '@/lib/accounts';
import { captureAttachments } from '@/lib/attachments';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/attachments/backfill?hours=6 — recover attachments for recently
// received emails by matching Resend's received-email list to our stored rows
// (by message_id). Gated by TRIAGE_SWEEP_SECRET. Runs in production (needs the
// live account Resend keys).
export async function POST(req: NextRequest) {
  const secret = process.env.TRIAGE_SWEEP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Backfill disabled. Set TRIAGE_SWEEP_SECRET to enable.' },
      { status: 403 },
    );
  }
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.nextUrl.searchParams.get('key');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hours = Math.min(Math.max(Number(req.nextUrl.searchParams.get('hours')) || 6, 1), 72);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const supabase = getServiceClient();

  let matched = 0;
  let stored = 0;
  const notes: string[] = [];

  for (const account of getAccounts()) {
    if (!account.resendApiKey) continue;
    try {
      const res = await fetch('https://api.resend.com/emails/receiving?limit=100', {
        headers: { Authorization: `Bearer ${account.resendApiKey}` },
      });
      if (!res.ok) {
        notes.push(`${account.id}: list ${res.status}`);
        continue;
      }
      const body = await res.json();
      const received: { id: string; message_id?: string; created_at?: string }[] = body?.data || [];

      for (const r of received) {
        if (r.created_at && new Date(r.created_at).getTime() < cutoff) continue;
        if (!r.message_id) continue;
        // Find our stored inbound row by message_id.
        const { data: row } = await supabase
          .from('emails')
          .select('id')
          .eq('message_id', r.message_id)
          .eq('direction', 'inbound')
          .limit(1)
          .maybeSingle();
        if (!row) continue;
        matched += 1;
        stored += await captureAttachments(supabase, account.resendApiKey, r.id, row.id);
      }
    } catch (err) {
      notes.push(`${account.id}: ${(err instanceof Error ? err.message : 'error').slice(0, 80)}`);
    }
  }

  return NextResponse.json({ hours, matched, attachmentsStored: stored, notes });
}
