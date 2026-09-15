import type { CSSProperties } from 'react';
import {
  isAgentNode,
  isConductorNode,
  isHumanNode,
  type GraphNode,
  type OrganizationProjection,
} from '@bagos/contracts';
import { toTree, type TreeNode } from '@bagos/organization';
import { StatusBadge } from './StatusBadge';

// The synchronised accessible tree walks the SAME projection as the graph
// and prints the same relationship sentences that live on the edges.

export interface OrganizationTreeProps {
  readonly projection: OrganizationProjection;
}

function kindLabel(node: GraphNode): string {
  if (isHumanNode(node)) return 'human';
  if (isConductorNode(node)) return 'conductor';
  if (isAgentNode(node)) return 'agent';
  return 'department';
}

function NodeRow({ tn }: { tn: TreeNode }): React.JSX.Element {
  const isAgent = isAgentNode(tn.node);
  const wrapperProps: Record<string, string> = {};
  if (isAgent) wrapperProps['data-domain-slot'] = String(tn.node.domainSlot);

  const rowStyle: CSSProperties = {
    display: 'flex',
    gap: 'var(--space-4)',
    alignItems: 'baseline',
    padding: 'var(--space-3) 0',
    borderLeft: isAgent ? '2px solid var(--domain-active-core)' : '2px solid transparent',
    paddingLeft: 'var(--space-4)',
  };

  const kindStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-micro-size)',
    letterSpacing: 'var(--tracking-micro)',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    minWidth: '6.5rem',
  };

  return (
    <li {...wrapperProps}>
      <div style={rowStyle}>
        <span style={kindStyle}>{kindLabel(tn.node)}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <strong>{tn.node.label}</strong>
          {tn.relationshipToParent ? (
            <span
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-body-size)',
              }}
            >
              {tn.relationshipToParent}
            </span>
          ) : null}
          {isHumanNode(tn.node) ? (
            <span style={{ color: 'var(--text-muted)' }}>
              Authority scope: {tn.node.authorityScope}
            </span>
          ) : null}
          {isConductorNode(tn.node) || isAgentNode(tn.node) ? (
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <StatusBadge status={tn.node.status} />
            </div>
          ) : null}
        </div>
      </div>
      {tn.children.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: '0 0 0 var(--space-5)', margin: 0 }}>
          {tn.children.map((child) => (
            <NodeRow key={child.node.id} tn={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrganizationTree({ projection }: OrganizationTreeProps): React.JSX.Element {
  const roots = toTree(projection);
  return (
    <nav aria-label="Organization hierarchy (accessible tree)">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {roots.map((r) => (
          <NodeRow key={r.node.id} tn={r} />
        ))}
      </ul>
    </nav>
  );
}
