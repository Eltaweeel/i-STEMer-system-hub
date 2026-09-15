'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface CommandPaletteItem {
  readonly href: string;
  readonly label: string;
}

export interface CommandPaletteProps {
  readonly items: readonly CommandPaletteItem[];
}

export function CommandPalette({ items }: CommandPaletteProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const listId = useId();
  const filtered = items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  function close(): void {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  useEffect(() => {
    function onShortcut(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown' && filtered.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % filtered.length);
      return;
    }
    if (event.key === 'ArrowUp' && filtered.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      window.location.assign(filtered[activeIndex].href);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input, a[href], button:not([disabled])');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          minHeight: 'var(--c-button-h)',
          padding: '0 var(--space-4)',
          color: 'var(--text-secondary)',
          background: 'var(--surface-raised)',
          border: '1px solid var(--line-default)',
          borderRadius: 'var(--radius-control)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro-size)',
          letterSpacing: 'var(--tracking-micro)',
          cursor: 'pointer',
        }}
      >
        Search <span aria-hidden="true">⌘/Ctrl K</span>
      </button>
      {open ? (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'start center', padding: 'min(16vh, 7rem) var(--space-4) var(--space-4)', background: 'var(--surface-scrim)' }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${listId}-title`}
            onKeyDown={onDialogKeyDown}
            style={{ width: 'min(38rem, 100%)', maxHeight: '70vh', overflow: 'auto', padding: 'var(--space-4)', background: 'var(--surface-panel)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-panel)', boxShadow: '0 1.5rem 4rem rgba(0, 0, 0, 0.45)' }}
          >
            <h2 id={`${listId}-title`} style={{ margin: '0 0 var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-label-size)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>Navigate</h2>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-controls={listId}
              aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              placeholder="Search routes"
              style={{ width: '100%', minHeight: 'var(--c-button-h-touch)', padding: '0 var(--space-4)', color: 'var(--text-primary)', background: 'var(--surface-raised)', border: '1px solid var(--line-default)', borderRadius: 'var(--radius-control)', font: 'inherit' }}
            />
            <ul id={listId} role="listbox" aria-label="Routes" style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {filtered.map((item, index) => (
                <li key={item.href} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
                  <a
                    href={item.href}
                    onClick={close}
                    style={{ display: 'block', padding: 'var(--space-3) var(--space-4)', color: 'var(--text-link)', background: index === activeIndex ? 'var(--surface-selected)' : 'transparent', borderRadius: 'var(--radius-control)', textDecoration: 'none' }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            {filtered.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No matching route.</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
