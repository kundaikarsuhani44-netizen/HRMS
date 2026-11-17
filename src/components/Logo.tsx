/** Kinara ("shore" in Konkani/Marathi): a sun setting over two waves. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#ffffff" />
      <circle cx="20" cy="18" r="7" fill="#e07a1f" />
      <path d="M5 24c3.5 0 3.5-3 7.5-3s4 3 7.5 3 4-3 7.5-3 3.5 3 7.5 3v4H5z" fill="#0e5e6f" />
      <path d="M5 30c3.5 0 3.5-2.5 7.5-2.5s4 2.5 7.5 2.5 4-2.5 7.5-2.5 3.5 2.5 7.5 2.5v5H5z" fill="#0a4654" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: light ? '#fff' : 'var(--brand-strong)', fontWeight: 700, fontSize: 20 }}>
      <LogoMark size={34} />
      <span>Kinara HR<small style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.75 }}>Konkan Coastal Foods</small></span>
    </span>
  );
}
