import Link from 'next/link';
/** Shown when a URL is tampered with: the server refuses before any data is loaded. */
export function Denied({ message = 'You do not have access to this page.' }: { message?: string }) {
  return (
    <div className="card empty" role="alert">
      <div className="icon">🔒</div>
      <h2>Access denied</h2>
      <p className="muted">{message}</p>
      <Link className="btn" href="/">Go home</Link>
    </div>
  );
}
