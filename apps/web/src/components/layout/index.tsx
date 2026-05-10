import { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { useSessionBootstrap } from '@/hooks/use-sessions';
import { useI18n } from '@/i18n';

export function Layout() {
  useSessionBootstrap();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <a href="#main-content" className="skip-to-content">
        {t('nav.skipToContent')}
      </a>

      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header onMenuToggle={toggleSidebar} />
        <main id="main-content" style={{ flex: 1, overflow: 'auto', background: 'var(--color-bg)' }} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <NetworkStatusBanner />
    </div>
  );
}
