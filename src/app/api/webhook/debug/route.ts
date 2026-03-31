import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

// Stores the last webhook payload for debugging
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const supabase = getServiceClient();

  // Store raw payload in a debug table or just return it
  console.log('DEBUG webhook payload:', rawBody);

  return NextResponse.json({ received: JSON.parse(rawBody) });
}

// GET the last few webhook payloads from logs
export async function GET() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('emails')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  return NextResponse.json(data);
}
