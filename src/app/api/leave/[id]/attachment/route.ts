import { NextResponse } from 'next/server';
import { actorOrNull } from '@/lib/auth';
import { AccessDenied } from '@/lib/services/actor';
import { getAttachment } from '@/lib/services/leave';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await actorOrNull();
  if (!actor) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  try {
    const a = await getAttachment(actor, Number((await params).id));
    if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(a.content), {
      headers: { 'content-type': a.mime_type, 'content-disposition': `inline; filename="${a.file_name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' },
    });
  } catch (e) {
    if (e instanceof AccessDenied) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}
