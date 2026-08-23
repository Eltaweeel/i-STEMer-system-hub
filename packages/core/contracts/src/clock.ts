// The Clock is the only entry point for reading time. Every renderer that
// shows a relative time takes a Clock as a dependency. The lint rule that
// bans Date.now() and argument-less new Date() is what keeps this true.
export interface Clock {
  nowIso(): string;
}

export function fixedClock(nowIso: string): Clock {
  return { nowIso: () => nowIso };
}
