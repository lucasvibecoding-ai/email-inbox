import { NextResponse } from 'next/server';
import { getAccounts } from '@/lib/accounts';

export async function GET() {
  const accounts = getAccounts().map(({ id, email, senderName, displayName }) => ({
    id,
    email,
    senderName,
    displayName,
  }));
  return NextResponse.json(accounts);
}
