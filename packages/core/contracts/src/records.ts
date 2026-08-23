import type { DomainSlot } from './graph';

// The missing records the prior manifest did not model. Core defines the
// shape; the tenant supplies instances as data.

export interface ConductorRecord {
  readonly id: string;
  readonly displayName: string;
  readonly purpose: string;
  readonly responsibilities: readonly string[];
}

export interface DepartmentRecord {
  readonly slug: string;
  readonly label: string;
  readonly domainSlot: DomainSlot;
  readonly agentCount: number;
  readonly activeAgentCount: number | 'unknown';
}
