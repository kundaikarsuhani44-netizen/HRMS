import { NextResponse } from 'next/server';
import { z } from 'zod';
import { askAgent } from '@/lib/agent/run';
import { actorOrNull } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).default([]),
});

/** The agent runs AS the signed-in user (session cookie), never with a service key. */
export async function POST(req: Request) {
  const actor = await actorOrNull();
  if (!actor) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  return NextResponse.json(await askAgent(actor, parsed.data.history, parsed.data.question));
}
