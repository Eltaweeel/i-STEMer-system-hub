'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ViewMeta } from '@bagos/contracts';
import { DemoIndicator } from './DemoIndicator';
import { CommandPalette, type CommandPaletteItem } from './CommandPalette';

export type AppShellNavItem = CommandPaletteItem & {
  /** Optional Arabic label. The English label remains the stable route value. */
  readonly labelAr?: string;
};

export interface AppShellProps {
  readonly meta: ViewMeta;
  readonly productName: string;
  readonly organizationName: string;
  readonly children: ReactNode;
  readonly nav?: readonly AppShellNavItem[];
  /** Tenant-supplied brand asset. Shared core never embeds a tenant logo. */
  readonly brandMarkSrc?: string;
  readonly brandMarkAlt?: string;
  /** Optional tenant-supplied human authority avatar. */
  readonly humanAvatarSrc?: string;
  readonly humanAvatarAlt?: string;
}

type Language = 'en' | 'ar';
type Theme = 'light' | 'dark';

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--deep)',
  color: 'var(--text)',
  fontFamily: 'var(--sans)',
  fontSize: 'var(--body-size)',
  lineHeight: 'var(--body-line-height)',
};

const skipLinkStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: '-9999px',
  top: 0,
  zIndex: 90,
};

function readPreference<T extends string>(key: string, values: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && values.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function applyDocumentPreferences(language: Language, theme: Theme): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = theme;
}

export function AppShell({
  meta,
  productName,
  organizationName,
  children,
  nav = [],
  brandMarkSrc,
  brandMarkAlt = '',
  humanAvatarSrc,
  humanAvatarAlt = '',
}: AppShellProps): React.JSX.Element {
  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<Theme>('light');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const storedLanguage = readPreference('baos-language', ['en', 'ar'] as const, 'en');
    const storedTheme = readPreference('baos-theme', ['light', 'dark'] as const, 'light');
    setLanguage(storedLanguage);
    setTheme(storedTheme);
    applyDocumentPreferences(storedLanguage, storedTheme);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    applyDocumentPreferences(language, theme);
    try {
      window.localStorage.setItem('baos-language', language);
      window.localStorage.setItem('baos-theme', theme);
    } catch {
      // The shell remains usable when storage is unavailable (private browsing, for example).
    }
  }, [language, theme]);

  useEffect(() => {
    if (!moreOpen) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  const localizedNav = useMemo(
    () => nav.map((item) => ({ ...item, label: language === 'ar' ? item.labelAr ?? item.label : item.label })),
    [language, nav],
  );
  const hasMoreNavigation = localizedNav.length > 5;
  const primaryNav = localizedNav.slice(0, hasMoreNavigation ? 4 : 5);
  const moreNav = localizedNav.slice(hasMoreNavigation ? 4 : 5);
  const shellDirection = language === 'ar' ? 'rtl' : 'ltr';
  const isFixture = meta.source === 'fixture';

  return (
    <div className="app-shell" style={shellStyle} dir={shellDirection}>
      <a href="#main-content" className="app-shell-skip" style={skipLinkStyle}>Skip to main content</a>
      <DemoIndicator meta={meta} />

      <header className="app-shell-topbar">
        <div className="app-shell-brand" data-ltr="true">
          {brandMarkSrc ? <img className="app-shell-brand-mark" src={brandMarkSrc} alt={brandMarkAlt} /> : null}
          <div className="app-shell-brand-copy">
            <strong>{productName}</strong>
            <span>{organizationName}</span>
          </div>
        </div>

        <div className="app-shell-toolbar" aria-label={language === 'ar' ? 'إعدادات العرض' : 'Display settings'}>
          {humanAvatarSrc ? (
            <span className="app-shell-human" title={humanAvatarAlt || undefined}>
              <img src={humanAvatarSrc} alt={humanAvatarAlt} />
            </span>
          ) : null}
          <CommandPalette items={localizedNav} />
          <div className="app-shell-segmented" role="group" aria-label={language === 'ar' ? 'اللغة' : 'Language'}>
            <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} lang="en">EN</button>
            <button type="button" onClick={() => setLanguage('ar')} aria-pressed={language === 'ar'} lang="ar">العربية</button>
          </div>
          <button
            type="button"
            className="app-shell-icon-button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'light' ? 'DARK' : 'LIGHT'}
          </button>
        </div>
      </header>

      <div className="app-shell-frame">
        <aside className="app-shell-sidebar" aria-label={language === 'ar' ? 'التنقل الأساسي' : 'Primary navigation'}>
          <div className="app-shell-sidebar-heading" data-ltr="true">
            <span className="app-shell-status-dot" aria-hidden="true" />
            <span>{isFixture ? 'SAMPLE COMMAND CENTER' : 'COMMAND CENTER'}</span>
          </div>
          <nav className="app-shell-nav" aria-label={language === 'ar' ? 'الشاشات' : 'Screens'}>
            {localizedNav.map((item) => (
              <a key={item.href} href={item.href} className="app-shell-nav-link">
                <span aria-hidden="true" data-ltr="true">{item.label.slice(0, 2).toUpperCase()}</span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="app-shell-system-strip" aria-label={language === 'ar' ? 'حالة النظام' : 'System status'}>
            <span className="app-shell-system-kicker">SYSTEM SURFACE</span>
            <strong>{isFixture ? 'FIXTURE DATA' : 'CONNECTED DATA'}</strong>
            <span>{isFixture ? 'No live external actions' : 'Captured source data'}</span>
          </div>
        </aside>

        <main id="main-content" className="app-shell-main">
          <div className="app-shell-main-inner">{children}</div>
        </main>
      </div>

      <nav className="app-shell-mobile-nav" aria-label={language === 'ar' ? 'التنقل السريع' : 'Quick navigation'}>
        {primaryNav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        {moreNav.length > 0 ? (
          <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
            {language === 'ar' ? 'المزيد' : 'More'}
          </button>
        ) : null}
      </nav>

      {moreOpen ? (
        <div className="app-shell-more-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
          <section className="app-shell-more-sheet" role="dialog" aria-modal="true" aria-labelledby="app-shell-more-title">
            <div className="app-shell-more-header">
              <h2 id="app-shell-more-title">{language === 'ar' ? 'كل الشاشات' : 'All screens'}</h2>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}>×</button>
            </div>
            <div className="app-shell-more-links">
              {moreNav.map((item) => <a key={item.href} href={item.href} onClick={() => setMoreOpen(false)}>{item.label}</a>)}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
