import type { CSSProperties } from 'react';
import type { DesignConcept, DesignConceptVariant } from '@bagos/contracts';

// -----------------------------------------------------------------------------
// Design concepts are DETERMINISTIC inline SVG posters built from design
// tokens. No photographs, no stock imagery, no external assets, no grey
// placeholder boxes. Three variants — orbit, grid, ribbon — are visually
// distinct enough that selecting a direction is a real choice.
//
// Each concept is scoped with data-domain-slot so `--domain-active-*` resolves
// to its own hue. Coordinates are hardcoded per variant; nothing is randomised.
// -----------------------------------------------------------------------------

export interface DesignConceptCardProps {
  readonly concept: DesignConcept;
  readonly selected?: boolean;
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  overflow: 'hidden',
  minWidth: 0,
};

const posterStyle: CSSProperties = {
  width: '100%',
  aspectRatio: '4 / 5',
  display: 'block',
  background: 'var(--surface-raised)',
};

const bodyStyle: CSSProperties = {
  padding: 'var(--space-4) var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

function OrbitPoster(): JSX.Element {
  return (
    <>
      <rect x="0" y="0" width="400" height="500" fill="var(--surface-raised)" />
      <circle cx="200" cy="230" r="140" fill="none" stroke="var(--domain-active-edge)" strokeWidth="1" />
      <circle cx="200" cy="230" r="96" fill="none" stroke="var(--domain-active-edge)" strokeWidth="1" />
      <circle cx="200" cy="230" r="56" fill="var(--domain-active-tint)" stroke="var(--domain-active-core)" strokeWidth="2" />
      <circle cx="200" cy="230" r="18" fill="var(--domain-active-core)" />
      <circle cx="340" cy="230" r="8" fill="var(--domain-active-core)" />
      <circle cx="200" cy="90" r="6" fill="var(--domain-active-core)" opacity="0.85" />
      <circle cx="112" cy="298" r="5" fill="var(--domain-active-core)" opacity="0.7" />
      <line x1="60" y1="420" x2="340" y2="420" stroke="var(--line-strong)" strokeWidth="1" />
    </>
  );
}

function GridPoster(): JSX.Element {
  const cells: JSX.Element[] = [];
  const cols = 5;
  const rows = 6;
  const cellW = 60;
  const cellH = 60;
  const originX = 50;
  const originY = 60;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * cellW;
      const y = originY + r * cellH;
      // Deterministic emphasis pattern — every (r + c) even cell is filled.
      const emphasise = (r + c) % 2 === 0;
      cells.push(
        <rect
          key={`c-${r}-${c}`}
          x={x + 4}
          y={y + 4}
          width={cellW - 8}
          height={cellH - 8}
          fill={emphasise ? 'var(--domain-active-tint)' : 'transparent'}
          stroke="var(--domain-active-edge)"
          strokeWidth="1"
        />,
      );
    }
  }
  return (
    <>
      <rect x="0" y="0" width="400" height="500" fill="var(--surface-raised)" />
      {cells}
      <rect x="50" y="60" width="300" height="360" fill="none" stroke="var(--domain-active-core)" strokeWidth="2" />
      <rect x="170" y="180" width="60" height="120" fill="var(--domain-active-core)" />
    </>
  );
}

function RibbonPoster(): JSX.Element {
  return (
    <>
      <rect x="0" y="0" width="400" height="500" fill="var(--surface-raised)" />
      <path
        d="M 20 380 Q 120 260, 220 320 T 380 200"
        fill="none"
        stroke="var(--domain-active-core)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 20 420 Q 140 320, 240 360 T 380 260"
        fill="none"
        stroke="var(--domain-active-edge)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M 20 460 Q 160 380, 260 400 T 380 320"
        fill="none"
        stroke="var(--domain-active-tint)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <circle cx="380" cy="200" r="10" fill="var(--domain-active-core)" />
      <circle cx="20" cy="380" r="6" fill="var(--domain-active-core)" opacity="0.7" />
    </>
  );
}

function VariantContent({ variant }: { variant: DesignConceptVariant }): JSX.Element {
  if (variant === 'orbit') return <OrbitPoster />;
  if (variant === 'grid') return <GridPoster />;
  return <RibbonPoster />;
}

export function DesignConceptCard({ concept, selected }: DesignConceptCardProps): JSX.Element {
  const outline: CSSProperties = selected
    ? { boxShadow: '0 0 0 2px var(--focus-ring)' }
    : {};
  return (
    <article
      data-domain-slot={String(concept.domainSlot)}
      data-concept-variant={concept.variant}
      style={{ ...cardStyle, ...outline }}
      aria-label={`Design concept: ${concept.label}`}
    >
      <svg
        viewBox="0 0 400 500"
        style={posterStyle}
        role="img"
        aria-label={concept.altText}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{concept.altText}</title>
        <VariantContent variant={concept.variant} />
        <text
          x="200"
          y="470"
          textAnchor="middle"
          fill="var(--text-primary)"
          fontFamily="var(--font-mono)"
          fontSize="16"
          letterSpacing="1.4"
          style={{ textTransform: 'uppercase' }}
        >
          {concept.slogan}
        </text>
      </svg>
      <div style={bodyStyle}>
        <span style={labelStyle}>Concept · {concept.variant}</span>
        <strong style={{ fontSize: 'var(--text-heading-size)' }}>{concept.label}</strong>
        <span style={{ color: 'var(--text-secondary)' }}>{concept.rationale}</span>
      </div>
    </article>
  );
}
