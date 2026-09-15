import type { CSSProperties } from 'react';
import {
  isAgentNode,
  isConductorNode,
  isDepartmentNode,
  isHumanNode,
  type GraphNode,
  type OrganizationProjection,
} from '@bagos/contracts';
import { computeLayout, orderEdges } from '@bagos/organization';
import { StatusBadge } from './StatusBadge';

export interface OrganizationGraphProps {
  readonly projection: OrganizationProjection;
}

const canvasStyle: CSSProperties = {
  width: '100%',
  height: 'clamp(360px, 60vh, 640px)',
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
};

function nodeRadius(node: GraphNode): number {
  if (isHumanNode(node)) return 26;
  if (isConductorNode(node)) return 34;
  if (isDepartmentNode(node)) return 24;
  return 22;
}

function nodeShapeLabel(node: GraphNode): string {
  if (isHumanNode(node)) return 'HUMAN';
  if (isConductorNode(node)) return 'CONDUCTOR';
  if (isDepartmentNode(node)) return 'DEPARTMENT';
  if (isAgentNode(node)) return 'AGENT';
  return 'NODE';
}

export function OrganizationGraph({ projection }: OrganizationGraphProps): React.JSX.Element {
  const positions = computeLayout(projection, {
    columnGap: 200,
    rankGap: 140,
    originX: 400,
    originY: 60,
  });

  const edges = orderEdges(projection.edges);
  const width = 820;
  const height = 560;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={canvasStyle}
      role="img"
      aria-label={projection.title}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{projection.title}</title>
      <desc>
        Top-down organization graph. Refer to the accessible tree beside this graph for the
        same relationships in reading order.
      </desc>
      {/* edges */}
      <g>
        {edges.map((e) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          return (
            <line
              key={e.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--edge-color)"
              strokeWidth="var(--edge-w)"
            >
              <title>{e.accessibleDescription}</title>
            </line>
          );
        })}
      </g>
      {/* nodes */}
      <g>
        {projection.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const r = nodeRadius(n);
          const wrapProps = isAgentNode(n) || isDepartmentNode(n)
            ? { 'data-domain-slot': String(n.domainSlot) }
            : {};
          const fill = isHumanNode(n)
            ? 'var(--surface-raised)'
            : isConductorNode(n)
              ? 'var(--surface-raised)'
              : 'var(--domain-active-tint)';
          const stroke = isHumanNode(n)
            ? 'var(--node-human-ring)'
            : isConductorNode(n)
              ? 'var(--line-contrast)'
              : 'var(--domain-active-core)';
          const strokeWidth = isHumanNode(n) ? 'var(--node-human-ring-w)' : 'var(--node-stroke-w)';
          return (
            <g key={n.id} {...wrapProps}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
              {/* Human ring is a second ring for maximum unmistakability */}
              {isHumanNode(n) ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 4}
                  fill="none"
                  stroke="var(--node-human-ring)"
                  strokeWidth="var(--node-human-ring-w)"
                  strokeDasharray="2 3"
                />
              ) : null}
              {/* mandatory kind label above the node */}
              <text
                x={p.x}
                y={p.y - r - 10}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                fontSize="10"
                letterSpacing="1.2"
                style={{ textTransform: 'uppercase' }}
              >
                {nodeShapeLabel(n)}
              </text>
              {/* mandatory display label below */}
              <text
                x={p.x}
                y={p.y + r + 18}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontFamily="var(--font-sans)"
                fontSize="13"
              >
                {n.label}
              </text>
              <title>{n.accessibleDescription}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// A separate compact list of the agents with their status badges. Kept
// beside the graph so a reader sees the status without inferring it from
// the SVG (colour never being load-bearing).
export function OrganizationStatusList({ projection }: OrganizationGraphProps): React.JSX.Element {
  const agents = projection.nodes.filter(isAgentNode);
  const conductors = projection.nodes.filter(isConductorNode);
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 'var(--space-4) 0 0',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      {conductors.map((c) => (
        <li
          key={c.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--surface-raised)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--line-subtle)',
          }}
        >
          <span>{c.label}</span>
          <StatusBadge status={c.status} />
        </li>
      ))}
      {agents.map((a) => (
        <li
          key={a.id}
          data-domain-slot={String(a.domainSlot)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--domain-active-tint)',
            borderLeft: '3px solid var(--domain-active-core)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <span>{a.label}</span>
          <StatusBadge status={a.status} />
        </li>
      ))}
    </ul>
  );
}
