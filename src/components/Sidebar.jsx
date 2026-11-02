import { useState, useEffect } from 'react';
import {
  ClipboardList,
  PackagePlus,
  Users,
  FileText,
  TrendingUp,
  Settings,
  Camera,
  LogOut,
  MapPin,
  UserCheck,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Trash2,
  Layers
} from 'lucide-react';
import { subscribePendingFieldContainers } from '../utils/fieldService';

export default function Sidebar({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  onOpenReport,
  onUserChange
}) {
  const [pendingFieldCount, setPendingFieldCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(
    ['settings', 'locais', 'inspectors', 'usuarios'].includes(currentTab)
  );

  useEffect(() => {
    const unsub = subscribePendingFieldContainers(
      records => setPendingFieldCount(records.length),
      () => setPendingFieldCount(0)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (['settings', 'locais', 'inspectors', 'usuarios'].includes(currentTab)) {
      setSettingsOpen(true);
    }
  }, [currentTab]);

  const isAdm = user?.role === 'ADM';
  const isInspector = user?.role === 'Inspector';
  const isExporter = user?.role === 'Exportador';

  const getRoleLabel = () => {
    if (isAdm) return 'MASTER';
    if (isInspector) return 'INSPETOR';
    if (isExporter) return 'EXPORTADOR';
    return user?.role || 'USUÁRIO';
  };

  const getInitials = (name) => {
    if (!name) return 'US';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <aside className="sidebar-desktop no-print">
      {/* Topo / Logo UNISPECT */}
      <div className="sidebar-header">
        <div className="sidebar-brand-box">
          <div className="sidebar-logo-badge">
            <span className="sidebar-logo-un">UN</span>
            <span className="sidebar-logo-sub">UNISPECT</span>
          </div>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-title">
              <span className="title-white">Unispect</span>
              <span className="title-accent">Service</span>
            </div>
            <div className="sidebar-brand-subtitle">
              VISTORIAS &amp; CERTIFICAÇÕES
            </div>
          </div>
        </div>
      </div>

      {/* Navegação Principal */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">MENU PRINCIPAL</div>

        <ul className="sidebar-menu-list">
          {/* 1. Bookings */}
          <li>
            <button
              type="button"
              onClick={() => setCurrentTab('bookings')}
              className={`sidebar-nav-item ${currentTab === 'bookings' ? 'active' : ''}`}
            >
              <ClipboardList size={18} className="sidebar-item-icon" />
              <span className="sidebar-item-text">Bookings</span>
            </button>
          </li>

          {/* 2. Inventário do Pátio */}
          {(isAdm || isInspector) && (
            <li>
              <button
                type="button"
                onClick={() => setCurrentTab('yard-inventory')}
                className={`sidebar-nav-item ${currentTab === 'yard-inventory' ? 'active' : ''}`}
              >
                <Layers size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-text">Inventário do Pátio</span>
              </button>
            </li>
          )}

          {/* 3. Containers sem Booking (com contagem real) */}
          {(isAdm || isInspector) && (
            <li>
              <button
                type="button"
                onClick={() => setCurrentTab('containers-sem-booking')}
                className={`sidebar-nav-item ${currentTab === 'containers-sem-booking' ? 'active' : ''}`}
              >
                <PackagePlus size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-text">Containers sem Booking</span>
                {pendingFieldCount > 0 && (
                  <span className="sidebar-count-badge">
                    {pendingFieldCount}
                  </span>
                )}
              </button>
            </li>
          )}

          {/* 3. Exportadores (Apenas ADM) */}
          {isAdm && (
            <li>
              <button
                type="button"
                onClick={() => setCurrentTab('exportadores')}
                className={`sidebar-nav-item ${currentTab === 'exportadores' ? 'active' : ''}`}
              >
                <Users size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-text">Exportadores</span>
              </button>
            </li>
          )}

          {/* 4. Análise e Relatórios */}
          <li>
            <button
              type="button"
              onClick={() => setCurrentTab('analytics-reports')}
              className={`sidebar-nav-item ${currentTab === 'analytics-reports' ? 'active' : ''}`}
            >
              <TrendingUp size={18} className="sidebar-item-icon" />
              <span className="sidebar-item-text">Análise e Relatórios</span>
            </button>
          </li>

          {/* 5. Configurações com sub-itens */}
          {(isAdm || isInspector) && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  if (!settingsOpen) setCurrentTab('settings');
                }}
                className={`sidebar-nav-item ${['settings', 'locais', 'inspectors', 'usuarios'].includes(currentTab) ? 'active' : ''}`}
              >
                <Settings size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-text">Configurações</span>
                {settingsOpen ? (
                  <ChevronDown size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
                ) : (
                  <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
                )}
              </button>

              {settingsOpen && (
                <ul className="sidebar-submenu-list">
                  {isAdm && (
                    <>
                      <li>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('locais')}
                          className={`sidebar-subitem ${currentTab === 'locais' ? 'active' : ''}`}
                        >
                          <MapPin size={14} />
                          <span>Locais de Operação</span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('inspectors')}
                          className={`sidebar-subitem ${currentTab === 'inspectors' ? 'active' : ''}`}
                        >
                          <UserCheck size={14} />
                          <span>Cadastro de Inspetores</span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('usuarios')}
                          className={`sidebar-subitem ${currentTab === 'usuarios' ? 'active' : ''}`}
                        >
                          <Users size={14} />
                          <span>Gerenciar Usuários</span>
                        </button>
                      </li>
                    </>
                  )}
                  <li>
                    <button
                      type="button"
                      onClick={() => setCurrentTab('settings')}
                      className={`sidebar-subitem ${currentTab === 'settings' ? 'active' : ''}`}
                    >
                      <Settings size={14} />
                      <span>Ajustes &amp; Rede</span>
                    </button>
                  </li>
                </ul>
              )}
            </li>
          )}

          {/* Modo Campo Mobile (atalho de teste no desktop) */}
          {(isAdm || isInspector) && (
            <li style={{ marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
              <button
                type="button"
                onClick={() => setCurrentTab('field-portal')}
                className={`sidebar-nav-item ${currentTab === 'field-portal' ? 'active' : ''}`}
                style={{ opacity: 0.85 }}
                title="Visualizar interface móvel do Modo Campo"
              >
                <Camera size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-text">Modo Campo (Mobile)</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Rodapé do Menu: Usuário, Perfil e Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">
            {getInitials(user?.username || user?.name)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name" title={user?.username || user?.name}>
              {user?.username || user?.name || 'Usuário'}
            </div>
            <div className="sidebar-user-meta">
              <span className={`sidebar-role-badge ${isAdm ? 'role-master' : 'role-user'}`}>
                {getRoleLabel()}
              </span>
              <span className="sidebar-version-tag">v2.2.1</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="sidebar-logout-btn"
          title="Sair do sistema"
        >
          <LogOut size={16} />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
