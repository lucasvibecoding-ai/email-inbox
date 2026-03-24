import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

// GET /api/emails/[id] - Get single email
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServiceClient();

  // Mark as read
  await supabase.from('emails').update({ is_read: true }).eq('id', id);

  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Get thread emails
  const { data: thread } = await supabase
    .from('emails')
    .select('*')
    .eq('thread_id', data.thread_id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ email: data, thread: thread || [] });
}

// PATCH /api/emails/[id] - Update email flags
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = getServiceClient();

  const allowed = ['is_read', 'is_starred', 'is_archived', 'is_trash'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { error } = await supabase.from('emails').update(updates).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/emails/[id] - Permanently delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { error } = await supabase.from('emails').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
