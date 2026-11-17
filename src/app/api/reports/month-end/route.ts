import { NextResponse, type NextRequest } from 'next/server';
import { actorOrNull } from '@/lib/auth';
import { todayIST } from '@/lib/ist';
import { AccessDenied } from '@/lib/services/actor';
import { monthEndSummary, toCsv } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await actorOrNull();
  if (!actor) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const today = todayIST();
  const y = Number(req.nextUrl.searchParams.get('y')) || Number(today.slice(0, 4));
  const m = Number(req.nextUrl.searchParams.get('m')) || Number(today.slice(5, 7));
  try {
    const { rows, codes } = await monthEndSummary(actor, y, m);
    return new NextResponse(toCsv(rows, codes), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kinara-month-end-${y}-${String(m).padStart(2, '0')}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AccessDenied) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
