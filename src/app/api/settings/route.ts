import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAutoSend, setAutoSend } from '@/lib/settings';

// GET /api/settings — current app settings (auth enforced by proxy).
export async function GET() {
  const supabase = getServiceClient();
  return NextResponse.json({ autoSend: await getAutoSend(supabase) });
}

// POST /api/settings { autoSend: boolean } — toggle auto-send.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getServiceClient();
  try {
    await setAutoSend(supabase, !!body.autoSend);
    return NextResponse.json({ autoSend: !!body.autoSend });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save setting' },
      { status: 500 },
    );
  }
}
