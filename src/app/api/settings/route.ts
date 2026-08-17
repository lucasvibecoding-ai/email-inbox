import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAutoSend, setAutoSend, getAutoAck, setAutoAck } from '@/lib/settings';

// GET /api/settings — current app settings (auth enforced by proxy).
export async function GET() {
  const supabase = getServiceClient();
  return NextResponse.json({
    autoSend: await getAutoSend(supabase),
    autoAck: await getAutoAck(supabase),
  });
}

// POST /api/settings { autoSend?: boolean, autoAck?: boolean } — toggle either
// switch. Only the keys present in the body are written.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getServiceClient();
  try {
    if ('autoSend' in body) await setAutoSend(supabase, !!body.autoSend);
    if ('autoAck' in body) await setAutoAck(supabase, !!body.autoAck);
    return NextResponse.json({
      autoSend: await getAutoSend(supabase),
      autoAck: await getAutoAck(supabase),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save setting' },
      { status: 500 },
    );
  }
}
