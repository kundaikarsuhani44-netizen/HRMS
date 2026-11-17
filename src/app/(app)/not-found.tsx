import Link from 'next/link';
export default function NotFound() {
  return <div className="card empty"><div className="icon">🔎</div><h2>Not found</h2><p className="muted">That record does not exist, or you do not have access to it.</p><Link className="btn" href="/">Go home</Link></div>;
}
