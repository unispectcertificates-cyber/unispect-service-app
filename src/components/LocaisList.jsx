import { useState } from 'react';
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react';
import { db, useLocais } from '../db';

export default function LocaisList({ onDataChange }) {
  const locais = useLocais();
  const [showModal, setShowModal] = useState(false);
  const [editingLocal, setEditingLocal] = useState(null);
  const [formData, setFormData] = useState({ name: '' });

  const handleOpenAdd = () => {
    setEditingLocal(null);
    setFormData({ name: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (local) => {
    setEditingLocal(local);
    setFormData({ name: local.name });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir este local?')) {
      await db.deleteLocal(id);
            if (onDataChange) onDataChange();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) return;

    await db.saveLocal({
      id: editingLocal ? editingLocal.id : undefined,
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
          Locais da Operação
        </h3>
        <button onClick={handleOpenAdd} className="btn btn-primary" style={{ padding: '8px 16px' }}>
          <Plus size={14} /> Novo Local
        </button>
      </div>

      {/* Grid de Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {locais.map(local => (
          <div key={local.id} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-brand-light)',
                color: 'var(--color-brand)'
              }}>
                <MapPin size={16} />
              </div>
              <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{local.name}</span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                onClick={() => handleOpenEdit(local)}
                className="btn btn-secondary" 
                style={{ padding: '6px', border: '1px solid var(--text-secondary)' }}
                title="Editar"
              >
                <Edit2 size={11} />
              </button>
              <button 
                onClick={() => handleDelete(local.id)}
                className="btn btn-danger" 
                style={{ padding: '6px' }}
                title="Excluir"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}

        {locais.length === 0 && (
          <div className="glass-panel" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <MapPin size={40} style={{ marginBottom: '8px', opacity: 0.5, color: 'var(--color-brand)' }} />
            <p style={{ fontWeight: '600' }}>Nenhum local cadastrado.</p>
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
          <form onSubmit={handleSubmit} className="glass-panel" style={{ maxWidth: '380px', width: '100%', padding: '24px', border: '1px solid var(--border-color)' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '18px', fontFamily: 'var(--font-display)' }}>
              {editingLocal ? 'Editar Local' : 'Adicionar Local'}
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label>Nome do Local</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({ name: e.target.value })}
                placeholder="Ex: Vila Velha Terminal"
                required
                autoFocus
              />
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
