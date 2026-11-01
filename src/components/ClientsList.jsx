import { useState } from 'react';
import { Plus, Edit2, Trash2, Building2, CheckCircle2, ArrowRight, ShieldCheck, FileText } from 'lucide-react';
import { db, useClients, useBookings } from '../db';

export default function ClientsList({ selectedClientId, onSelectClient, onDataChange }) {
  const clients = useClients();
  const bookings = useBookings();
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    cnpj: '',
    description: ''
  });
  const [error, setError] = useState('');

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({ name: '', code: '', cnpj: '', description: '' });
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      code: client.code || '',
      cnpj: client.cnpj || '',
      description: client.description || ''
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (client) => {
    if (client.id === 'client_interport') {
      alert('O cliente INTERPORT é o cliente operacional principal com histórico vinculado e não pode ser excluído.');
      return;
    }
    const count = bookings.filter(b => b.clientId === client.id).length;
    const msg = count > 0
      ? `Atenção: O cliente "${client.name}" possui ${count} booking(s). Deseja realmente excluí-lo?`
      : `Deseja realmente excluir o cliente "${client.name}"?`;

    if (confirm(msg)) {
      try {
        await db.deleteClient(client.id);
        if (selectedClientId === client.id && onSelectClient) {
          onSelectClient('client_interport');
        }
        if (onDataChange) onDataChange();
      } catch (err) {
        alert(err.message || 'Erro ao excluir cliente.');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = formData.name.trim();
    const cleanCode = formData.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!cleanName) {
      setError('Informe o nome da empresa ou terminal.');
      return;
    }
    if (!cleanCode) {
      setError('Informe um código/sigla válido (ex: TPS, INTERPORT).');
      return;
    }

    // Verifica se já existe outro cliente com mesmo código
    const exists = clients.some(c => 
      c.code?.toUpperCase() === cleanCode && 
      (!editingClient || c.id !== editingClient.id)
    );
    if (exists) {
      setError(`Já existe um cliente cadastrado com o código "${cleanCode}".`);
      return;
    }

    try {
      const saved = await db.saveClient({
        id: editingClient ? editingClient.id : undefined,
        name: cleanName,
        code: cleanCode,
        cnpj: formData.cnpj.trim(),
        description: formData.description.trim(),
        active: true
      });

      setShowModal(false);
      if (onDataChange) onDataChange();

      // Se for novo cliente, seleciona automaticamente seu painel
      if (!editingClient && onSelectClient) {
        onSelectClient(saved.id);
      }
    } catch (err) {
      setError(err.message || 'Erro ao salvar cliente.');
    }
  };

  const getClientBookingsCount = (clientId) => {
    if (clientId === 'client_interport') {
      return bookings.filter(b => !b.clientId || b.clientId === 'client_interport').length;
    }
    return bookings.filter(b => b.clientId === clientId).length;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} style={{ color: 'var(--color-brand)' }} />
            Cadastro de Clientes Operacionais
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            Gerencie os clientes e terminais. Cada cliente possui seu painel de trabalho separado reutilizando os módulos operacionais.
          </p>
        </div>

        <button 
          onClick={handleOpenAdd} 
          className="btn btn-primary" 
          style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}
        >
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Grid de Cards de Clientes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '18px'
      }}>
        {clients.map(client => {
          const isInterport = client.id === 'client_interport' || client.code === 'INTERPORT';
          const isSelected = selectedClientId === client.id;
          const bookingsCount = getClientBookingsCount(client.id);

          return (
            <div 
              key={client.id} 
              className="glass-panel" 
              style={{ 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                gap: '16px',
                border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--border-color)',
                borderRadius: '10px',
                position: 'relative',
                boxShadow: isSelected ? '0 0 15px rgba(226, 178, 62, 0.2)' : 'none',
                backgroundColor: 'var(--bg-secondary)'
              }}
            >
              {/* Topo do card */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: isInterport ? 'rgba(226, 178, 62, 0.15)' : 'var(--bg-tertiary)',
                      color: isInterport ? 'var(--color-brand)' : 'var(--text-primary)'
                    }}>
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        {client.name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '800',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          letterSpacing: '0.5px'
                        }}>
                          {client.code}
                        </span>
                        {isInterport && (
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '700',
                            backgroundColor: '#ecfdf5',
                            color: '#065f46',
                            padding: '2px 8px',
                            borderRadius: '12px'
                          }}>
                            <ShieldCheck size={12} />
                            Histórico Vinculado
                          </span>
                        )}
                        {!isInterport && bookingsCount === 0 && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--text-muted)',
                            padding: '2px 8px',
                            borderRadius: '12px'
                          }}>
                            Novo (Vazio)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: '800',
                      backgroundColor: 'var(--color-brand)',
                      color: '#000000',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      textTransform: 'uppercase'
                    }}>
                      <CheckCircle2 size={12} /> Painel Ativo
                    </span>
                  )}
                </div>

                {client.description && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {client.description}
                  </p>
                )}

                {client.cnpj && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    CNPJ: <strong>{client.cnpj}</strong>
                  </div>
                )}
              </div>

              {/* Informações Operacionais & Ações */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <FileText size={15} style={{ color: 'var(--color-brand)' }} />
                  <span>
                    <strong>{bookingsCount}</strong> {bookingsCount === 1 ? 'booking' : 'bookings'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    onClick={() => handleOpenEdit(client)}
                    className="btn btn-secondary" 
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    title="Editar cliente"
                  >
                    <Edit2 size={13} />
                  </button>

                  {!isInterport && (
                    <button 
                      onClick={() => handleDelete(client)}
                      className="btn btn-danger" 
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      title="Excluir cliente"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  <button
                    onClick={() => onSelectClient && onSelectClient(client.id)}
                    className={`btn ${isSelected ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>{isSelected ? 'Ver Painel' : 'Abrir Painel'}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Cadastro / Edição de Cliente */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '480px',
            width: '100%',
            padding: '28px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={20} style={{ color: 'var(--color-brand)' }} />
              {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
            </h3>

            {error && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-danger-light)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: '600',
                marginBottom: '14px'
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Nome da Empresa / Terminal *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Terminal Portuário Santos"
                  required
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Sigla / Código Operacional *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Ex: TPS ou VVT"
                  disabled={editingClient?.id === 'client_interport'}
                  required
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '700',
                    letterSpacing: '1px',
                    boxSizing: 'border-box'
                  }}
                />
                {editingClient?.id === 'client_interport' && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                    O código do cliente principal INTERPORT é protegido.
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CNPJ (opcional)
                </label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  placeholder="Ex: 00.000.000/0001-00"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Descrição / Observações (opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Informações adicionais do recinto, terminal ou operação..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontWeight: '700' }}
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
