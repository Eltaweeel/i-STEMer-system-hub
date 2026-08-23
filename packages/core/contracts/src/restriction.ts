// A Restriction is a structural declaration that something is prohibited.
// It carries NO handler, NO href, and NO action field, so it is impossible
// to render as a clickable control. The type system, not convention, is what
// prevents a prohibited action from becoming an affordance.
export interface Restriction {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
  // No `href`. No `onActivate`. No `action`. Do not add them.
}

export function makeRestriction(input: {
  id: string;
  label: string;
  reason: string;
}): Restriction {
  return { id: input.id, label: input.label, reason: input.reason };
}
