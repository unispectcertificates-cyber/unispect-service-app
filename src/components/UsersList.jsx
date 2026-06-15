import { useState } from 'react';
import { Plus, Edit2, Trash2, User, Key, ShieldAlert } from 'lucide-react';
import { db, useUsers } from '../db';

export default function UsersList({ onDataChange }) {
  const users = useUsers();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    login: '',
    password: '',
    role: 'Inspector',
  });

  const currentUser = db.getUser();

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      login: '',
      password: '',
      role: 'Inspector',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (u) => {
    setEditingUser(u);
    setFormData({
      name: u.name,
      login: u.login,
      password: u.password,
      role: u.role,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (currentUser && currentUser.id === id) {
      alert('Você não pode excluir o seu próprio usuário logado.');
      return;
    }
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      await db.deleteUser(id);
      if (onDataChange) onDataChange();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.login || !formData.password || !formData.role) return;

    db.saveUser({
      id: editingUser ? editingUser.id : undefined,
      ...formData,
    });

    setShowModal(false);
    if (onDataChange) onDataChange();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Mini header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>
          Gerenciar Usuários do Sistema
        </h3>
        <button onClick={handleOpenAdd} className="btn btn-primary" style={{ padding: '8px 16px' }}>
          <Plus size={14} /> Novo Usuário
        </button>
      </div>

      {/* Grid de Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {users.map((u) => (
          <div
            key={u.id}
            className="glass-panel"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: u.role === 'ADM' ? 'rgba(230, 185, 65, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: u.role === 'ADM' ? 'var(--color-brand)' : 'var(--color-success)',
                }}
              >
                <User size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                  {u.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>Login: <strong>{u.login}</strong></span>
                  <span>•</span>
                  <span>Perfil: <strong>{u.role === 'ADM' ? 'Master (ADM)' : 'Inspetor'}</strong></span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => handleOpenEdit(u)}
                className="btn btn-secondary"
                style={{ padding: '6px', border: '1px solid var(--text-secondary)' }}
                title="Editar"
              >
                <Edit2 size={11} />
              </button>
              <button
                onClick={() => handleDelete(u.id)}
                className="btn btn-danger"
                disabled={currentUser && currentUser.id === u.id}
                style={{ padding: '6px', opacity: currentUser && currentUser.id === u.id ? 0.3 : 1 }}
                title="Excluir"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <div className="glass-panel" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <User size={40} style={{ marginBottom: '8px', opacity: 0.5, color: 'var(--color-brand)' }} />
            <p style={{ fontWeight: '600' }}>Nenhum usuário cadastrado.</p>
          </div>
        )}
      </div>

      {/* Cadastro Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 7, 15, 0.75)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px',
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-panel"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '24px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h2 style={{ marginBottom: '6px', fontSize: '18px', fontFamily: 'var(--font-display)' }}>
              {editingUser ? 'Editar Usuário' : 'Adicionar Usuário'}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Defina as credenciais e o perfil de acesso do colaborador.
            </p>

            <div>
              <label>Nome Completo *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Carlos Santos"
                required
                autoFocus
              />
            </div>

            <div>
              <label>Usuário / Login *</label>
              <input
                type="text"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                placeholder="Ex: carlos"
                required
              />
            </div>

            <div>
              <label>Senha *</label>
              <input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Defina a senha"
                required
              />
            </div>

            <div>
              <label>Perfil de Acesso *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              >
                <option value="Inspector">Inspetor (Acesso limitado às operações)</option>
                <option value="ADM">Master / ADM (Acesso total às configurações)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
