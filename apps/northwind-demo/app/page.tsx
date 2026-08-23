import Link from 'next/link';

export default function IndexPage(): JSX.Element {
  return (
    <section>
      <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>
        Northwind conformance fixture
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '68ch' }}>
        A synthetic research-operations tenant backed only by frozen fixture data. Nothing here is
        live, and no external action can be taken.
      </p>
      <p><Link href="/organization/">View the organization</Link></p>
    </section>
  );
}
