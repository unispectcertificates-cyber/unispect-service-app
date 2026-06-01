import { LayoutDashboard, ClipboardList, Settings, User } from 'lucide-react';

export default function MobileNav({ currentTab, setCurrentTab, user, onOpenProfileModal }) {
  const isExporter = user.role === 'Exportador';

  if (isExporter) {
    return (
      <nav className="no-print no-select" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(60px + var(--safe-area-bottom))',
        paddingBottom: 'var(--safe-area-bottom)',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 1000
      }}>
        <button
          onClick={() => setCurrentTab('relatorios')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: currentTab === 'relatorios' ? 'var(--color-brand)' : 'var(--text-muted)',
            fontSize: '11px',
            fontWeight: currentTab === 'relatorios' ? '700' : '500',
            cursor: 'pointer'
          }}
        >
          <ClipboardList size={20} />
          <span>Relatórios</span>
        </button>
        <button
          onClick={onOpenProfileModal}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '11px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <User size={20} />
          <span>Perfil</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="no-print no-select" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 'calc(60px + var(--safe-area-bottom))',
      paddingBottom: 'var(--safe-area-bottom)',
      backgroundColor: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 1000
    }}>
      <button
        onClick={() => setCurrentTab('dashboard')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: currentTab === 'dashboard' ? 'var(--color-brand)' : 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: currentTab === 'dashboard' ? '700' : '500',
          cursor: 'pointer'
        }}
      >
        <LayoutDashboard size={20} />
        <span>Dashboard</span>
      </button>

      <button
        onClick={() => setCurrentTab('bookings')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: currentTab === 'bookings' ? 'var(--color-brand)' : 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: currentTab === 'bookings' ? '700' : '500',
          cursor: 'pointer'
        }}
      >
        <ClipboardList size={20} />
        <span>Bookings</span>
      </button>

      {user.role === 'ADM' && (
        <button
          onClick={() => setCurrentTab('exportadores')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: currentTab === 'exportadores' ? 'var(--color-brand)' : 'var(--text-muted)',
            fontSize: '11px',
            fontWeight: currentTab === 'exportadores' ? '700' : '500',
            cursor: 'pointer'
          }}
        >
          <User size={20} />
          <span>Exportadores</span>
        </button>
      )}

      <button
        onClick={onOpenProfileModal}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: '500',
          cursor: 'pointer'
        }}
      >
        <Settings size={20} />
        <span>Config</span>
      </button>
    </nav>
  );
}
