import {
  isAgentNode,
  isConductorNode,
  isDepartmentNode,
  isHumanNode,
  type GraphEdge,
  type GraphNode,
  type OrganizationProjection,
} from '@bagos/contracts';

// -----------------------------------------------------------------------------
// The projection is a PURE function of typed relationships. Ordering is stable
// and derived from the input, never from a Map iteration order or a wall-clock
// tiebreaker. The layout module (below) is disposable — no domain code reads
// a coordinate.
// -----------------------------------------------------------------------------

export interface OrganizationInput {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export function orderNodes(nodes: readonly GraphNode[]): readonly GraphNode[] {
  const rank = (n: GraphNode): number => {
    if (isHumanNode(n)) return 0;
    if (isConductorNode(n)) return 1;
    if (isDepartmentNode(n)) return 2;
    if (isAgentNode(n)) return 3;
    return 4;
  };
  return [...nodes].sort((a, b) => {
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    return a.id.localeCompare(b.id);
  });
}

export function orderEdges(edges: readonly GraphEdge[]): readonly GraphEdge[] {
  return [...edges].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    if (a.to !== b.to) return a.to.localeCompare(b.to);
    return a.kind.localeCompare(b.kind);
  });
}

// -----------------------------------------------------------------------------
// Layout: top-down hierarchy. Positions are CACHED and DISPOSABLE. If the
// input changes, positions can be recomputed and the domain is unaffected.
// This is a deliberate, tiny replacement for a graph library in Batch 1.
// -----------------------------------------------------------------------------

export interface NodePosition {
  readonly x: number;
  readonly y: number;
}
export type LayoutMap = ReadonlyMap<string, NodePosition>;

export interface LayoutOptions {
  readonly columnGap: number;
  readonly rankGap: number;
  readonly originX: number;
  readonly originY: number;
}

const DEFAULT_LAYOUT: LayoutOptions = {
  columnGap: 140,
  rankGap: 120,
  originX: 60,
  originY: 40,
};

export function computeLayout(
  projection: OrganizationProjection,
  options: Partial<LayoutOptions> = {},
): LayoutMap {
  const opts = { ...DEFAULT_LAYOUT, ...options };
  const ordered = orderNodes(projection.nodes);

  // Group by rank (using kind mapping).
  const rankOf = (n: GraphNode): number => {
    if (isHumanNode(n)) return 0;
    if (isConductorNode(n)) return 1;
    if (isDepartmentNode(n)) return 2;
    if (isAgentNode(n)) return 3;
    return 4;
  };

  const byRank = new Map<number, GraphNode[]>();
  for (const n of ordered) {
    const r = rankOf(n);
    const bucket = byRank.get(r) ?? [];
    bucket.push(n);
    byRank.set(r, bucket);
  }

  const positions = new Map<string, NodePosition>();
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of sortedRanks) {
    const bucket = byRank.get(r) ?? [];
    const y = opts.originY + r * opts.rankGap;
    const totalWidth = (bucket.length - 1) * opts.columnGap;
    const startX = opts.originX - totalWidth / 2;
    bucket.forEach((n, i) => {
      const x = startX + i * opts.columnGap;
      positions.set(n.id, { x, y });
    });
  }
  return positions;
}

// -----------------------------------------------------------------------------
// The accessible tree is generated from THE SAME nodes and edges as the graph.
// It is not a parallel implementation.
// -----------------------------------------------------------------------------

export interface TreeNode {
  readonly node: GraphNode;
  readonly relationshipToParent: string | null;
  readonly children: readonly TreeNode[];
}

export function toTree(projection: OrganizationProjection): readonly TreeNode[] {
  const parentToChildren = new Map<string, GraphEdge[]>();
  const childToParent = new Map<string, GraphEdge>();

  for (const e of orderEdges(projection.edges)) {
    if (e.kind !== 'reports_to') continue;
    // reports_to: from = subordinate, to = supervisor.
    const supervisorEdges = parentToChildren.get(e.to) ?? [];
    supervisorEdges.push(e);
    parentToChildren.set(e.to, supervisorEdges);
    childToParent.set(e.from, e);
  }

  const nodeById = new Map<string, GraphNode>();
  for (const n of projection.nodes) nodeById.set(n.id, n);

  const roots = orderNodes(projection.nodes).filter((n) => !childToParent.has(n.id));

  const build = (n: GraphNode, incoming: GraphEdge | null): TreeNode => {
    const childEdges = parentToChildren.get(n.id) ?? [];
    const children = childEdges
      .map((edge) => {
        const child = nodeById.get(edge.from);
        return child ? build(child, edge) : null;
      })
      .filter((x): x is TreeNode => x !== null);
    return {
      node: n,
      relationshipToParent: incoming ? incoming.accessibleDescription : null,
      children,
    };
  };

  return roots.map((r) => build(r, null));
}
