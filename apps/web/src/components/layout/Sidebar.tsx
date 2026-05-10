import { memo } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n';

const navGroups = [
  {
    labelKey: 'nav.sessionOps',
    items: [
      { to: '/', labelKey: 'nav.createJoinSession', icon: SessionsIcon },
      { to: '/sessions', labelKey: 'nav.collabMonitor', icon: CollaborationIcon },
    ],
  },
  {
    labelKey: 'nav.systemMgmt',
    items: [
      { to: '/models', labelKey: 'nav.modelMgmt', icon: ModelsIcon },
      { to: '/agents', labelKey: 'nav.agentMgmt', icon: AgentsIcon },
      { to: '/skills', labelKey: 'nav.skillMgmt', icon: SkillsIcon },
      { to: '/progress', labelKey: 'nav.systemStatus', icon: ProgressIcon },
      { to: '/profile', labelKey: 'nav.userProfile', icon: ProfileIcon },
    ],
  },
];

export const Sidebar = memo(function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <aside
      role="navigation"
      aria-label={t('nav.mainNav')}
      style={{
        width: '260px',
        background: 'var(--color-sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        borderRight: '1px solid var(--color-sidebar-border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--color-sidebar-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              background: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-sidebar-text-active)', letterSpacing: '-0.02em' }}>
              AI Collab
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-sidebar-text)' }}>
              {t('nav.adminPanel')}
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px', overflow: 'auto' }} aria-label={t('nav.pageNav')}>
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} style={{ marginBottom: '20px' }}>
            <div
              style={{
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-sidebar-text)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(group.labelKey)}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-sidebar-text-active)' : 'var(--color-sidebar-text)',
                  background: isActive ? 'var(--color-sidebar-active)' : 'transparent',
                  marginBottom: '0',
                  transition: 'all 0.15s',
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('active')) {
                    el.style.background = 'var(--color-sidebar-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('active')) {
                    el.style.background = 'transparent';
                  }
                }}
              >
                <item.icon aria-hidden="true" />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        role="status"
        aria-label={t('nav.systemStatusAria')}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--color-success)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: '12px', color: 'var(--color-sidebar-text)', flex: 1 }}>
          {t('nav.systemOnline')}
        </span>
        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          style={{
            padding: '2px 8px',
            border: '1px solid var(--color-sidebar-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--color-sidebar-text)',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
      </div>
    </aside>
  );
});

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ModelsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CollaborationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="12" y1="10" x2="12" y2="16" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SkillsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
