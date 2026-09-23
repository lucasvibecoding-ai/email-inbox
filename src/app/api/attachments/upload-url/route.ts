import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createOutboundUploadUrl } from '@/lib/attachments';

export const runtime = 'nodejs';

// POST /api/attachments/upload-url { filename } -> { path, signedUrl }
// The browser PUTs the file straight to Supabase Storage with this URL, so a
// big file never has to fit inside a Vercel request body. Auth comes from the
// proxy (session required), same as every other route here.
export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 });
    }
    const upload = await createOutboundUploadUrl(getServiceClient(), filename);
    return NextResponse.json(upload);
  } catch (err) {
    console.error('upload-url error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not prepare the upload' },
      { status: 500 },
    );
  }
}
