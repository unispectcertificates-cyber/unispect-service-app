import { useState } from 'react';
import { LayoutDashboard, ClipboardList, Users, MapPin, Trash2, ShieldAlert, Moon, Sun, UserCheck } from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, user, onUserChange, isDark, toggleDarkMode }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADM', 'Inspector'] },
    { id: 'bookings', label: 'Gerenciar Bookings', icon: ClipboardList, roles: ['ADM', 'Inspector'] },
    { id: 'exportadores', label: 'Exportadores', icon: Users, roles: ['ADM'] },
    { id: 'locais', label: 'Locais da Operação', icon: MapPin, roles: ['ADM'] },
    { id: 'relatorios', label: 'Relatórios', icon: ClipboardList, roles: ['Exportador'] },
  ];

  const handleAccountDeletion = () => {
    alert('Sua solicitação de exclusão de conta foi registrada. Os dados associados serão removidos em até 7 dias úteis, conforme as diretrizes da Play Store.');
    setShowDeleteModal(false);
  };

  const handleRoleChange = (e) => {
    const role = e.target.value;
    let username = 'Usuário';
    if (role === 'ADM') username = 'Administrador';
    if (role === 'Inspector') username = 'Carlos (Inspetor)';
    if (role === 'Exporter') username = 'Café Atlântica (Exportador)';
    onUserChange({ role, username });
    
    // Redireciona para o menu correto se o menu atual não for visível para a nova role
    if (role === 'Exportador') {
      setCurrentTab('relatorios');
    } else {
      setCurrentTab('dashboard');
    }
  };

  return (
    <aside className="sidebar no-print">
      {/* Topo / Logo */}
      <div style={{ padding: '28px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ 
          width: '42px', 
          height: '42px', 
          borderRadius: 'var(--radius-md)', 
          background: 'var(--color-brand-gradient)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: '#fff', 
          fontWeight: '800', 
          fontSize: '20px',
          boxShadow: 'var(--shadow-glow)'
        }}>
          US
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontFamily: 'var(--font-display)', fontWeight: '700', lineHeight: '1.2' }}>Unispect Service</h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.05em' }}>SYSTEM v1.0</span>
        </div>
      </div>

      {/* Seletor de Perfil (Simulador de Testes) */}
      <div style={{ 
        padding: '16px 18px', 
        backgroundColor: 'var(--bg-tertiary)', 
        margin: '20px 16px 10px', 
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          fontSize: '10px', 
          textTransform: 'uppercase', 
          letterSpacing: '0.08em',
          fontWeight: '800',
          color: 'var(--text-muted)'
        }}>
          <UserCheck size={12} /> Testar Como (Perfil)
        </label>
        <select 
          value={user.role} 
          onChange={handleRoleChange}
          style={{ 
            padding: '8px 12px', 
            fontSize: '13px', 
            marginTop: '8px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: '600'
          }}
        >
          <option value="ADM">Administrador (ADM)</option>
          <option value="Inspector">Inspetor</option>
          <option value="Exportador">Exportador</option>
        </select>
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
          Usuário: <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong>
        </div>
      </div>

      {/* Menu Principal */}
      <nav style={{ flex: 1, padding: '12px 12px' }}>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {menuItems
            .filter(item => item.roles.includes(user.role))
            .map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setCurrentTab(item.id)}
                    className="no-select"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      backgroundColor: isActive ? 'var(--color-brand-light)' : 'transparent',
                      color: isActive ? 'var(--color-brand)' : 'var(--text-secondary)',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'var(--transition-all)',
                      transform: isActive ? 'translateX(4px)' : 'none'
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.transform = 'translateX(4px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.transform = 'none';
                      }
                    }}
                  >
                    <Icon size={18} style={{ color: isActive ? 'var(--color-brand)' : 'var(--text-muted)' }} />
                    {item.label}
                  </button>
                </li>
              );
            })}
        </ul>
      </nav>

      {/* Botões de Ações Inferiores */}
      <div style={{ padding: '16px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Toggle Dark Mode */}
        <button
          onClick={toggleDarkMode}
          className="btn btn-secondary no-select"
          style={{ width: '100%', justifyContent: 'flex-start', fontSize: '13px', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
          {isDark ? 'Tema Claro' : 'Tema Escuro'}
        </button>

        {/* Delete Account Button */}
        <button
          onClick={() => setShowDeleteModal(true)}
          className="btn btn-secondary no-select"
          style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--color-danger)', fontSize: '13px', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
        >
          <Trash2 size={16} />
          Excluir Conta
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(6, 8, 15, 0.7)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '420px', width: '100%', padding: '28px', position: 'relative', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ padding: '10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                <ShieldAlert size={26} />
              </div>
              <div>
                <h3 style={{ fontSize: '20px', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Excluir Conta Permanentemente?</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Esta ação é irreversível. Todos os seus dados pessoais e logs operacionais vinculados a este usuário serão excluídos definitivamente da nossa base conforme os requisitos da Play Store.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleAccountDeletion} className="btn btn-danger">Confirmar Exclusão</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
