// Real sRGB relative luminance and WCAG contrast computation.
// Nothing here uses precomputed magic numbers — if a token is darkened,
// the ratio drops and the test fails.

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6) {
    throw new Error(`Expected a 6-digit hex, got "${hex}"`);
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) {
    throw new Error(`Malformed hex: "${hex}"`);
  }
  return { r, g, b };
}

function channelLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const la = relativeLuminance(fgHex);
  const lb = relativeLuminance(bgHex);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

// Darken a hex by a fixed absolute amount per channel (0..255). Used by the
// property-based side of the contrast test to prove the check is sensitive.
export function darkenHex(hex: string, delta: number): string {
  const { r, g, b } = parseHex(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const to2 = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${to2(r - delta)}${to2(g - delta)}${to2(b - delta)}`;
}
