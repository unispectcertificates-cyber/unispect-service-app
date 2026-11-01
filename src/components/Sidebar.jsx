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
  Layers,
  Building2,
  LayoutDashboard,
  Key,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { subscribePendingFieldContainers } from '../utils/fieldService';
import { useClients } from '../db';
import { changeUserPassword } from '../utils/authService';

export default function Sidebar({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  onOpenReport,
  onUserChange,
  selectedClientId,
  onSelectClient
}) {
  const clients = useClients();
  const [pendingFieldCount, setPendingFieldCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(
    ['settings', 'locais', 'inspectors', 'usuarios'].includes(currentTab)
  );

  // Estado para troca da própria senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: '', success: '' });

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

  const getRoleLabel = () => {
    if (isAdm) return 'MASTER';
    if (isInspector) return 'INSPETOR';
    return user?.role || 'OPERACIONAL';
  };

  const getInitials = (name) => {
    if (!name) return 'US';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ loading: false, error: 'A nova senha deve ter no mínimo 6 caracteres.', success: '' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ loading: false, error: 'As senhas informadas não coincidem.', success: '' });
      return;
    }

    setPasswordStatus({ loading: true, error: '', success: '' });
    try {
      await changeUserPassword(newPassword);
      setPasswordStatus({ loading: false, error: '', success: 'Senha alterada com sucesso!' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
        setPasswordStatus({ loading: false, error: '', success: '' });
      }, 1500);
    } catch (err) {
      setPasswordStatus({ loading: false, error: err.message || 'Erro ao alterar a senha.', success: '' });
    }
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

      {/* Seletor de Painel do Cliente Ativo */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: '800', color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Building2 size={12} />
            <span>Painel do Cliente</span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('clientes')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline'
            }}
            title="Gerenciar cadastro de clientes"
          >
            Gerenciar
          </button>
        </div>

        <select
          value={selectedClientId || 'client_interport'}
          onChange={(e) => {
            if (e.target.value === '__NEW__') {
              setCurrentTab('clientes');
            } else if (onSelectClient) {
              onSelectClient(e.target.value);
            }
          }}
          style={{
            width: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(226, 178, 62, 0.4)',
            color: '#ffffff',
            padding: '6px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          {clients.map(c => (
            <option key={c.id} value={c.id} style={{ backgroundColor: '#131b2e', color: '#ffffff' }}>
              {c.name} ({c.code})
            </option>
          ))}
          <option value="__NEW__" style={{ backgroundColor: '#131b2e', color: 'var(--color-brand)' }}>
            + Cadastrar Novo Cliente...
          </option>
        </select>
      </div>

      {/* Navegação Principal */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">MENU OPERACIONAL</div>

        <ul className="sidebar-menu-list">
          {/* 0. Dashboard Geral Unispect */}
          <li>
            <button
              type="button"
              id="sidebar-nav-dashboard-geral"
              onClick={() => setCurrentTab('dashboard-geral')}
              className={`sidebar-nav-item ${currentTab === 'dashboard-geral' ? 'active' : ''}`}
              style={currentTab === 'dashboard-geral' ? {
                backgroundColor: 'rgba(226, 178, 62, 0.15)',
                color: 'var(--color-brand)',
                borderColor: 'var(--color-brand)'
              } : {}}
            >
              <LayoutDashboard size={18} className="sidebar-item-icon" />
              <span className="sidebar-item-text" style={{ fontWeight: '800' }}>Dashboard Geral</span>
            </button>
          </li>

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

          {/* 2. Cadastro de Clientes */}
          <li>
            <button
              type="button"
              onClick={() => setCurrentTab('clientes')}
              className={`sidebar-nav-item ${currentTab === 'clientes' ? 'active' : ''}`}
            >
              <Building2 size={18} className="sidebar-item-icon" />
              <span className="sidebar-item-text">Cadastro de Clientes</span>
            </button>
          </li>

          {/* 3. Inventário do Pátio */}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <button
            type="button"
            onClick={() => {
              setShowPasswordModal(true);
              setPasswordStatus({ loading: false, error: '', success: '' });
            }}
            className="sidebar-logout-btn"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#e2b23e' }}
            title="Alterar minha senha de acesso"
          >
            <Key size={15} />
            <span>Alterar Minha Senha</span>
          </button>

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
      </div>

      {/* Modal de Alteração de Senha */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#131b2e',
            border: '1px solid rgba(226, 178, 62, 0.4)',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '380px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} style={{ color: 'var(--color-brand)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                  Alterar Minha Senha
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
              Defina sua nova senha pessoal de acesso. A alteração entra em vigor imediatamente.
            </p>

            {passwordStatus.error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{passwordStatus.error}</span>
              </div>
            )}

            {passwordStatus.success && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>{passwordStatus.success}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                  Nova Senha (mínimo 6 dígitos)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha"
                  required
                  disabled={passwordStatus.loading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                  Confirme a Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                  disabled={passwordStatus.loading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={passwordStatus.loading}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={passwordStatus.loading}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--color-brand)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {passwordStatus.loading ? (
                    <>
                      <Loader2 size={14} className="rotating" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    'Salvar Senha'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
