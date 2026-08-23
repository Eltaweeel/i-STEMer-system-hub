import Link from 'next/link';

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
      <p>
        <Link href="/organization/" style={{ color: 'var(--text-link)' }}>
          Open the organization view
        </Link>
      </p>
    </section>
  );
}
