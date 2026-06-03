import { useState } from 'react';
import { Plus, Mail, Phone, UserPlus } from 'lucide-react';
import { db, useExportadores } from '../db';

export default function ExportadoresList({ onDataChange }) {
  const exportadores = useExportadores();
  const [showModal, setShowModal] = useState(false);
  const [editingExp, setEditingExp] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  const handleOpenAdd = () => {
    setEditingExp(null);
    setFormData({ name: '', email: '', phone: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (exp) => {
    setEditingExp(exp);
    setFormData({ name: exp.name, email: exp.email, phone: exp.phone });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir este exportador?')) {
      await db.deleteExportador(id);
            if (onDataChange) onDataChange();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) return;

    db.saveExportador({
      id: editingExp ? editingExp.id : undefined,
      ...formData
    });

    setShowModal(false);
    if (onDataChange) onDataChange();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Mini header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ fontSize: '16px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>
          Exportadores Cadastrados
        </h3>
        <button onClick={handleOpenAdd} className="btn btn-primary" style={{ padding: '8px 16px' }}>
          <Plus size={14} /> Novo Exportador
        </button>
      </div>

      {/* Grid de Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {exportadores.map(exp => (
          <div key={exp.id} className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>{exp.name}</h4>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <Mail size={12} style={{ color: 'var(--color-brand)' }} />
                <span>{exp.email || 'Nenhum e-mail'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Phone size={12} style={{ color: 'var(--color-brand)' }} />
                <span>{exp.phone || 'Nenhum telefone'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <button 
                onClick={() => handleOpenEdit(exp)}
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--text-secondary)' }}
              >
                Editar
              </button>
              <button 
                onClick={() => handleDelete(exp.id)}
                className="btn btn-danger" 
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}

        {exportadores.length === 0 && (
          <div className="glass-panel" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <UserPlus size={40} style={{ marginBottom: '8px', opacity: 0.5, color: 'var(--color-brand)' }} />
            <p style={{ fontWeight: '600' }}>Nenhum exportador cadastrado.</p>
          </div>
        )}
      </div>

      {/* Cadastro Modal */}
      {showModal && (
        <div className="modal-overlay" style={{
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <form onSubmit={handleSubmit} className="glass-panel" style={{ maxWidth: '420px', width: '100%', padding: '24px', border: '1px solid var(--border-color)' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '18px', fontFamily: 'var(--font-display)' }}>
              {editingExp ? 'Editar Exportador' : 'Adicionar Exportador'}
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label>Razão Social / Nome</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: AgroBrasil Exportadora S.A."
                  required
                />
              </div>

              <div>
                <label>E-mail</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com"
                />
              </div>

              <div>
                <label>Telefone</label>
                <input 
                  type="text" 
                  value={formData.phone} 
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
