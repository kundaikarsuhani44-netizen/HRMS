import { Chat } from '@/components/Chat';
import { agentConfigured } from '@/lib/agent/run';
import { requireActor } from '@/lib/auth';

export const metadata = { title: 'Ask HR' };

export default async function Assistant() {
  const actor = await requireActor();
  return (
    <>
      <div className="page-head"><div><h1>Ask HR</h1><span className="muted">Answers come from your real data via tools — shown under each reply. It can only draft; you confirm.</span></div></div>
      {!agentConfigured() && <div className="alert warn">The AI model key is not set on this server, so the assistant cannot answer. All other screens work.</div>}
      <Chat isManager={actor.is_manager || actor.is_hr_admin} name={actor.full_name} />
    </>
  );
}
