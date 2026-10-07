import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useTheme } from '../context/ThemeContext';

const MOBILE_BREAKPOINT = 1024;

export function AppShell({ children, currentPage = 'dashboard', onNavigate, mainRef, onOpenSearch }) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT
  );
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      // Desktop always shows the rail; mobile closes the drawer on resize.
      setSidebarOpen(mobile ? false : true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [currentPage, isMobile]);

  const sidebarVisible = isMobile ? sidebarOpen : true;

  return (
    <div
      className={`app-shell ${resolvedTheme} ${sidebarVisible ? 'sidebar-open' : ''} ${isMobile ? 'mobile' : ''}`}
    >
      <Sidebar
        isOpen={sidebarVisible}
        onClose={() => setSidebarOpen(false)}
        onNavigate={onNavigate}
        currentPage={currentPage}
      />

      {isMobile && sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="main-wrapper">
        <Topbar
          isMobile={isMobile}
          onMenuClick={() => setSidebarOpen((open) => !open)}
          onOpenSearch={onOpenSearch}
          onNavigate={onNavigate}
        />

        <main className="main-content" role="main" ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;