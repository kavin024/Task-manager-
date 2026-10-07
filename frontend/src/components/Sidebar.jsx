export function Sidebar({ isOpen, onClose, onNavigate, currentPage }) {
  const navSections = [
    {
      label: 'NEXUS',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
        { id: 'tasks', label: 'Tasks', icon: '✓' },
        { id: 'kanban', label: 'Kanban', icon: '📋' },
        { id: 'calendar', label: 'Calendar', icon: '📅' },
      ]
    },
    {
      label: 'WORKSPACE',
      items: [
        { id: 'projects', label: 'Projects', icon: '📁' },
        { id: 'focus', label: 'Focus', icon: '⏱' },
        { id: 'analytics', label: 'Analytics', icon: '📊' },
        { id: 'notes', label: 'Notes', icon: '📝' },
      ]
    },
    {
      label: 'SYSTEM',
      items: [
        { id: 'settings', label: 'Settings', icon: '⚙' },
      ]
    }
  ];

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'collapsed'}`} role="navigation" aria-label="Main navigation">
      <div className="sidebar-header">
        {isOpen && (
          <div className="sidebar-brand">
            <span className="brand-icon">⚡</span>
            <span className="brand-text">NEXUS</span>
          </div>
        )}
        {!isOpen && <span className="brand-icon collapsed">⚡</span>}
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.label} className="nav-section">
            {isOpen && (
              <div className="nav-section-label">{section.label}</div>
            )}
            <ul className="nav-list" role="list">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    aria-current={currentPage === item.id ? 'page' : undefined}
                    title={isOpen ? undefined : item.label}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    {isOpen && <span className="nav-label">{item.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {isOpen && (
          <div className="user-info">
            <div className="avatar">U</div>
            <div className="user-details">
              <span className="user-name">User</span>
              <span className="user-role">Student</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}