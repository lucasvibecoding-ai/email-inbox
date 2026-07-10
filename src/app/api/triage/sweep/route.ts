import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAccountByEmail } from '@/lib/accounts';
import { runTriageForEmail } from '@/lib/triage';
import { Email } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CONCURRENCY = 5;

// POST /api/triage/sweep?limit=10 — triage inbound emails that have no ai_status
// yet (retries failures, backfills older mail). Gated by TRIAGE_SWEEP_SECRET so
// it is not an open, token-spending endpoint. Call repeatedly to work through a
// backlog; each processed email is marked, so re-runs skip finished ones.
export async function POST(req: NextRequest) {
  const secret = process.env.TRIAGE_SWEEP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Sweep disabled. Set TRIAGE_SWEEP_SECRET to enable.' },
      { status: 403 },
    );
  }
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.nextUrl.searchParams.get('key');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 10, 1), 25);
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('direction', 'inbound')
    .is('ai_status', null)
    .eq('is_trash', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as Email[];
  let triaged = 0;
  let unmatched = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        const account =
          (row.to_addresses || []).map(getAccountByEmail).find(Boolean) || null;
        if (!account) {
          unmatched += 1;
          await supabase
            .from('emails')
            .update({
              ai_status: 'needs_human',
              ai_reason: 'No matching course account for triage',
              ai_processed_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          return;
        }
        await runTriageForEmail(supabase, row, account);
        triaged += 1;
      }),
    );
  }

  return NextResponse.json({ processed: rows.length, triaged, unmatched });
}
