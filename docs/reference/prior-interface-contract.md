# Interface Contract — Agent OS Frontend

## Purpose

The UI must run against labeled fixtures during design and the real API later without component rewrites.

## TypeScript data-source interface

```ts
export interface AgentOsDataSource {
  getShellContext(): Promise<ShellContext>;
  getCommandCenter(query?: CommandCenterQuery): Promise<CommandCenterView>;
  getOrganizationGraph(query: GraphQuery): Promise<GraphProjection>;
  getDepartmentGraph(departmentId: string, query: GraphQuery): Promise<GraphProjection>;
  getKnowledgeGraph(query: KnowledgeGraphQuery): Promise<GraphProjection>;
  listDepartments(): Promise<DepartmentSummary[]>;
  listAgents(query: AgentListQuery): Promise<Page<AgentSummary>>;
  getAgent(agentId: string): Promise<AgentDetail>;
  listSops(query: SopListQuery): Promise<Page<SopSummary>>;
  getSop(sopId: string, revision?: number): Promise<SopDetail>;
  listSkills(query: SkillListQuery): Promise<Page<SkillSummary>>;
  getSkill(skillId: string, version?: string): Promise<SkillDetail>;
  listPersonas(): Promise<PersonaSummary[]>;
  getPersona(personaId: string, version?: string): Promise<PersonaDetail>;
  dryRunPersona(personaId: string, version: string): Promise<PersonaInstallPlan>;
  getSystemHealth(): Promise<SystemHealthView>;
  searchRegistry(query: string, limit?: number): Promise<RegistrySearchResult[]>;
}
```

Production mutation methods must live in separate authorized command services, not this read data source.

## Required metadata on every view

```ts
interface ViewMeta {
  generatedAt: string;
  capturedThrough?: string;
  source: "fixture" | "api";
  isSample: boolean;
  isPartial: boolean;
  stale: boolean;
  dataVersion: string;
  warnings: string[];
}
```

The shell must visibly label fixture/sample mode.

## Graph contract

```ts
type GraphNodeKind =
  | "human"
  | "conductor"
  | "department"
  | "agent"
  | "sop"
  | "skill"
  | "tool"
  | "connector"
  | "knowledge";

type GraphEdgeKind =
  | "reports_to"
  | "assigned_to"
  | "executes"
  | "uses"
  | "depends_on"
  | "builds_on"
  | "breaks_into"
  | "replaces"
  | "produces"
  | "reads"
  | "writes"
  | "approves";

interface GraphProjection {
  meta: ViewMeta;
  id: string;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  filters: GraphFilterDefinition[];
  clustering: {
    truncated: boolean;
    totalNodes: number;
    returnedNodes: number;
    expandableClusterIds: string[];
  };
}
```

Every `GraphNode` requires `id`, `kind`, `label`, `status`, `freshness`, `entityHref`, `accessibleDescription`, and domain/status tokens. Every edge requires an accessible text relationship.

## Agent detail contract

```ts
interface AgentDetail {
  meta: ViewMeta;
  id: string;
  displayName: string;
  department: EntityRef;
  purpose: string;
  runtimeMode: "on_demand_job" | "scheduled_job" | "daemon";
  enabled: boolean;
  status: StatusWithTimestamp;
  reportsTo: EntityRef;
  currentTask?: EntityRef;
  currentRun?: EntityRef;
  lastHeartbeat?: string;
  triggers: string[];
  allowedInputs: string[];
  allowedOutputs: string[];
  allowedTools: EntityRef[];
  prohibitedActions: string[];
  approvalPolicy: ApprovalPolicyView;
  dataPolicy: KeyValueView[];
  contextPolicy: ContextPolicyView;
  modelPolicy: ModelPolicyView;
  budgetPolicy: BudgetPolicyView;
  sops: EntityRef[];
  skills: VersionedEntityRef[];
  completionEvidence: string[];
  healthChecks: CheckSummary[];
  usage: UsageSummary;
  recentRuns: RunSummary[];
  blockedReason?: BlockedReason;
  auditHref: string;
}
```

## SOP detail contract

Requires:

- logical ID and exact revision;
- semantic version and canonical hash;
- status/risk/department;
- purpose;
- inputs/outputs;
- ordered steps and completion tests;
- assigned agents and human RACI roles;
- skill versions and tool/connector requirements;
- breaks-into/builds-on/depends-on/replaces/produces relationships;
- five-level autonomy policy;
- human responsibility;
- required approval tier;
- readiness and health findings;
- current/recent run references;
- audit link.

## Persona dry-run contract

`dryRunPersona` is safe/read-compute only in Feature 006. It returns:

- package identity/version/checksum/provenance;
- compatibility result;
- entities added/changed/removed;
- permissions/scopes requested;
- connectors and credentials required without values;
- missing dependencies;
- conflicts;
- budget estimate;
- warnings and blocking findings;
- `canConfirm`, which remains false if real install is out of scope.

## Routes

```text
/command
/organization
/departments/[departmentId]
/team
/agents/[agentId]
/workflows
/workflows/[sopId]?revision=N
/skills
/skills/[skillId]?version=X
/personas
/personas/[personaId]?version=X
/knowledge
/doctor
```

Route selection and graph state may use query parameters:

```text
?selected=agent:marketing-copywriter
&view=graph|list|tree
&status=blocked
&autonomy=human_assisted
&department=marketing
```

Validate parameters server-side and discard unauthorized/invalid selections safely.

## UI states

Every method/surface must handle:

- loading;
- empty;
- fixture/sample;
- partial;
- stale;
- offline;
- permission denied;
- entity not found;
- dependency unhealthy;
- blocked on human decision;
- provider unavailable while deterministic data remains available;
- error with retry and correlation ID.

## Contract parity test

Both fixture and API adapters run against the same test suite:

1. response validates;
2. 37 roles and six department counts match registry;
3. every relationship target resolves or is explicitly external;
4. no secret-pattern values;
5. sample/live metadata present;
6. every graph node has a route and accessible description;
7. every graph edge has accessible relationship text;
8. timestamps are UTC ISO-8601;
9. prohibited fields are absent;
10. filters return stable deterministic results.

## Security

- The data source never receives raw credentials.
- Mutation commands use CSRF-safe authenticated endpoints and server authorization.
- Deep links do not leak entity existence across permissions.
- User-facing error payloads omit traces and sensitive nested metadata.
- Reference frames are not importable from `apps/web` or copied into output.
