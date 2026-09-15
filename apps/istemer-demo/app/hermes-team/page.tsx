import { TeamView } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { FixtureAdapter } from '../../adapters/fixture-adapter';

export default async function HermesTeamPage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const [team, capacity] = await Promise.all([
    adapter.getTeam(),
    adapter.getCapacitySnapshot(),
  ]);

  return (
    <section>
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>Hermes team and capacity</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          The named Adam roster, its evidence handoffs, and the quota panel are shown as a read-only fixture projection until the Nous Hermes runtime and a provider telemetry adapter are connected.
        </p>
      </header>
      <TeamView team={team} capacity={capacity} formatTime={formatFixtureTime} />
    </section>
  );
}
