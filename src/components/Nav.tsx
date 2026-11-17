'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem { href: string; label: string; icon: string; count?: number; group?: string; mobile?: boolean }

const matches = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
/** Only the most specific matching item is active (/leave/apply should not also light up /leave). */
let ALL: string[] = [];
const isActive = (path: string, href: string) => matches(path, href) && !ALL.some((h) => h.length > href.length && matches(path, h));

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  ALL = items.map((i) => i.href);
  let lastGroup: string | undefined;
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => {
        const header = i.group && i.group !== lastGroup ? <div className="group">{i.group}</div> : null;
        lastGroup = i.group;
        return (
          <div key={i.href} style={{ display: 'contents' }}>
            {header}
            <Link href={i.href} className={isActive(path, i.href) ? 'active' : ''} aria-current={isActive(path, i.href) ? 'page' : undefined}>
              <span aria-hidden>{i.icon}</span>{i.label}{i.count ? <span className="count">{i.count}</span> : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  ALL = items.map((i) => i.href);
  return (
    <nav className="mobile-nav" aria-label="Quick">
      {items.filter((i) => i.mobile).slice(0, 5).map((i) => (
        <Link key={i.href} href={i.href} className={isActive(path, i.href) ? 'active' : ''}>
          <span className="ic" aria-hidden>{i.icon}</span>{i.label}
        </Link>
      ))}
    </nav>
  );
}
