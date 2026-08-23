import Link from 'next/link';

const linkStyle = { color: 'var(--text-link)' } as const;

const routes = [
  { href: '/organization/', label: 'Organization view' },
  { href: '/coordination-cycle/', label: 'Daily coordination cycle (proposed)' },
  { href: '/workflows/', label: 'Workflows' },
  { href: '/agents/', label: 'Agents' },
];

export default function IndexPage(): JSX.Element {
  return (
    <section>
      <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>
        Business Agent OS
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '60ch' }}>
        A fixtures-only, read-only visual operating system for managing AI agents. Nothing on
        this site runs, connects, or acts. Every timestamp is derived from a single frozen
        instant so the interface behaves identically on every visit.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-5) 0 0', display: 'grid', gap: 'var(--space-3)' }}>
        {routes.map((r) => (
          <li key={r.href}>
            <Link href={r.href} style={linkStyle}>
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
