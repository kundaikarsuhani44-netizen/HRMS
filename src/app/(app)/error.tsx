'use client';
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const denied = error.message?.includes('access') || error.name === 'AccessDenied';
  return (
    <div className="card empty" role="alert">
      <div className="icon">{denied ? '🔒' : '⚠️'}</div>
      <h2>{denied ? 'You do not have access to this' : 'Something went wrong'}</h2>
      <p className="muted">{denied ? 'This page belongs to someone else or needs a different role.' : 'The page could not load. Your data is safe.'}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn secondary" onClick={reset}>Try again</button>
        <a className="btn" href="/">Go home</a>
      </div>
      {error.digest && <p className="hint">Ref: {error.digest}</p>}
    </div>
  );
}
