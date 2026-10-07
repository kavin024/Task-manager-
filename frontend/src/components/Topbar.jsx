import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

export function Topbar({ onMenuClick, onOpenSearch, isMobile = false, searchPlaceholder = "Search tasks, projects, notes..." }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { toasts, hideToast } = useToast();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const themeMenuRef = useRef(null);
  const notificationsRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setThemeMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'system', label: 'System', icon: '💻' },
  ];

  return (
    <header className="topbar" role="banner">
      <button 
        className="menu-toggle btn btn-ghost btn-icon"
        onClick={onMenuClick}
        aria-label="Toggle navigation menu"
        aria-expanded={isMobile}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <div className="topbar-search" role="search">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="search"
          className="search-input input"
          placeholder={searchPlaceholder}
          readOnly
          onFocus={() => onOpenSearch?.()}
          onClick={() => onOpenSearch?.()}
          value=""
          autoComplete="off"
          aria-label="Global search - opens the command palette"
        />
        <kbd className="search-shortcut">⌘K</kbd>
      </div>

      <div className="topbar-actions">
        {/* Theme Switcher */}
        <div className="dropdown" ref={themeMenuRef}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            aria-label="Theme settings"
            aria-expanded={themeMenuOpen}
            aria-haspopup="true"
          >
            {resolvedTheme === 'dark' ? '🌙' : resolvedTheme === 'light' ? '☀️' : '💻'}
          </button>
          {themeMenuOpen && (
            <div className="dropdown-menu" role="menu">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`dropdown-item ${theme === opt.value ? 'active' : ''}`}
                  role="menuitemradio"
                  aria-checked={theme === opt.value}
                  onClick={() => {
                    setTheme(opt.value);
                    setThemeMenuOpen(false);
                  }}
                >
                  <span aria-hidden="true">{opt.icon}</span>
                  <span>{opt.label}</span>
                  {theme === opt.value && <span className="check-mark" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="dropdown" ref={notificationsRef}>
          <button
            className={`btn btn-ghost btn-icon ${toasts.length > 0 ? 'has-notifications' : ''}`}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            aria-label={`Notifications${toasts.length > 0 ? `, ${toasts.length} unread` : ''}`}
            aria-expanded={notificationsOpen}
            aria-haspopup="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {toasts.length > 0 && (
              <span className="notification-badge" aria-label={`${toasts.length} notifications`}>
                {toasts.length > 9 ? '9+' : toasts.length}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="dropdown-menu notifications-panel" style={{ width: '360px' }} role="menu">
              <div className="notifications-header">
                <h4>Notifications</h4>
                {toasts.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => toasts.forEach(t => hideToast(t.id))}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notifications-list">
                {toasts.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                    <p className="empty-state-message">No notifications</p>
                  </div>
                ) : (
                  toasts.map((toast) => (
                    <div key={toast.id} className={`notification-item toast ${toast.type}`} role="menuitem">
                      <div className="toast-icon">
                        {toast.type === 'success' && '✓'}
                        {toast.type === 'error' && '✕'}
                        {toast.type === 'warning' && '⚠'}
                        {toast.type === 'info' && 'ℹ'}
                      </div>
                      <div className="toast-content">
                        {toast.title && <div className="toast-title">{toast.title}</div>}
                        <div className="toast-message">{toast.message}</div>
                      </div>
                      <button className="toast-close" onClick={() => hideToast(toast.id)} aria-label="Dismiss">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="dropdown" ref={userMenuRef}>
          <button
            className="btn btn-ghost user-menu-trigger"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <div className="avatar avatar-sm">U</div>
            <span className="user-name">User</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {userMenuOpen && (
            <div className="dropdown-menu" role="menu">
              <div className="user-menu-header">
                <div className="avatar">U</div>
                <div>
                  <div className="user-name">User</div>
                  <div className="user-email">student@example.com</div>
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <button className="dropdown-item" role="menuitem" onClick={() => { setUserMenuOpen(false); onNavigate?.('dashboard'); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Profile
              </button>
              <button className="dropdown-item" role="menuitem" onClick={() => { setUserMenuOpen(false); onNavigate?.('settings'); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
              </button>
              <div className="dropdown-divider"></div>
              <button className="dropdown-item danger" role="menuitem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}