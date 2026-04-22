import { NextRequest, NextResponse } from 'next/server';
import { createSession, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  if (typeof password !== 'string' || password.length === 0 || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSession();
  const res = NextResponse.json({ success: true });
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
