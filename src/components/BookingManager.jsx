import { useState } from 'react';
import { Plus, Search, Calendar, MapPin, Eye, Trash2 } from 'lucide-react';
import { db, useBookings, useLocais, useExportadores } from '../db';
import PullToRefresh from './PullToRefresh';

export default function BookingManager({ user, onSelectBooking, onCreateBookingClick, onDataChange }) {
  const bookings = useBookings();
  const exportadores = useExportadores();
  const locais = useLocais();
  const [searchQuery, setSearchQuery] = useState('');

  const handleRefresh = () => { return new Promise((resolve) => { setTimeout(() => resolve(), 1000); }); };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja deletar este booking e todos os seus containers?')) {
      await db.deleteBooking(id);
      if (onDataChange) onDataChange();
    }
  };

  const filtered = bookings.filter(b => {
    const term = searchQuery.toLowerCase();
    if (!term) return true;
    
    const exp = exportadores.find(e => e.id === b.exporterId);
    const loc = locais.find(l => l.id === b.locationId);
    
    return (
      b.certificateNumber.toLowerCase().includes(term) ||
      b.bookingNumber.toLowerCase().includes(term) ||
      b.vesselVoyage.toLowerCase().includes(term) ||
      (exp && exp.name.toLowerCase().includes(term)) ||
      (loc && loc.name.toLowerCase().includes(term))
    );
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div style={{ padding: '32px 28px', flex: 1 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: '800' }}>Gerenciar Bookings</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Gerenciamento administrativo, status e locais de operação.</p>
          </div>
          {user.role === 'ADM' && (
            <button onClick={onCreateBookingClick} className="btn btn-primary" style={{ boxShadow: 'var(--shadow-glow)' }}>
              <Plus size={16} /> Novo Booking
            </button>
          )}
        </div>

        {/* Busca */}
        <div className="glass-panel" style={{ 
          padding: '14px 20px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '24px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Filtrar por certificado, navio, exportador ou local..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              border: 'none', 
              padding: '2px 0', 
              fontSize: '14px', 
              backgroundColor: 'transparent',
              boxShadow: 'none',
              width: '100%'
            }}
          />
        </div>

        {/* Tabela Desktop / Cards Mobile */}
        <div className="glass-panel" style={{ overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          {/* Visualização Desktop (Table) */}
          <div style={{ overflowX: 'auto', display: 'none', md: 'block' }} className="desktop-only-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '18px 24px' }}>Nº Certificado</th>
                  <th style={{ padding: '18px 24px' }}>Booking</th>
                  <th style={{ padding: '18px 24px' }}>Exportador</th>
                  <th style={{ padding: '18px 24px' }}>Lançamento</th>
                  <th style={{ padding: '18px 24px' }}>Data Início</th>
                  <th style={{ padding: '18px 24px' }}>Navio / Viagem</th>
                  <th style={{ padding: '18px 24px' }}>Containers</th>
                  <th style={{ padding: '18px 24px' }}>Sacas (Bags)</th>
                  <th style={{ padding: '18px 24px' }}>Local</th>
                  <th style={{ padding: '18px 24px' }}>Status</th>
                  <th style={{ padding: '18px 24px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const exp = exportadores.find(e => e.id === b.exporterId);
                  const loc = locais.find(l => l.id === b.locationId);
                  
                  const statusColors = {
                    'Pendente': 'badge-pending',
                    'Em andamento': 'badge-progress',
                    'Finalizado': 'badge-success'
                  };

                  return (
                    <tr 
                      key={b.id} 
                      onClick={() => onSelectBooking(b.id)}
                      style={{ 
                        borderBottom: '1px solid var(--border-color)', 
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '18px 24px', fontWeight: '800', color: 'var(--color-brand)' }}>{b.certificateNumber}</td>
                      <td style={{ padding: '18px 24px', fontWeight: '600' }}>{b.bookingNumber}</td>
                      <td style={{ padding: '18px 24px', fontWeight: '500' }}>{exp ? exp.name : 'N/A'}</td>
                      <td style={{ padding: '18px 24px', color: 'var(--text-secondary)' }}>{b.launchDate || b.startDate}</td>
                      <td style={{ padding: '18px 24px', color: 'var(--text-secondary)' }}>{b.startDate}</td>
                      <td style={{ padding: '18px 24px', color: 'var(--text-secondary)', fontWeight: '600' }}>{b.vesselVoyage}</td>
                      <td style={{ padding: '18px 24px', fontWeight: '700', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: 'var(--bg-tertiary)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)'
                        }}>{b.containers?.length || 0}</span>
                      </td>
                      <td style={{ padding: '18px 24px', color: 'var(--text-secondary)' }}>{b.bagsQuantity}</td>
                      <td style={{ padding: '18px 24px', color: 'var(--text-secondary)' }}>{loc ? loc.name : 'N/A'}</td>
                      <td style={{ padding: '18px 24px' }}>
                        <span className={`badge ${statusColors[b.status] || 'badge-pending'}`} style={{ padding: '4px 8px', fontSize: '10px' }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '18px 24px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button onClick={() => onSelectBooking(b.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            <Eye size={12} /> Ver
                          </button>
                          {user.role === 'ADM' && (
                            <button onClick={(e) => handleDelete(b.id, e)} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }}>
                              <Trash2 size={12} /> Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Visualização Mobile (Card Stack) */}
          <div className="mobile-only-cards" style={{ display: 'flex', flexDirection: 'column', gap: '1px', backgroundColor: 'var(--border-color)' }}>
            {filtered.map(b => {
              const exp = exportadores.find(e => e.id === b.exporterId);
              const loc = locais.find(l => l.id === b.locationId);
              
              const statusColors = {
                'Pendente': 'badge-pending',
                'Em andamento': 'badge-progress',
                'Finalizado': 'badge-success'
              };

              return (
                <div 
                  key={b.id} 
                  onClick={() => onSelectBooking(b.id)}
                  style={{ padding: '20px 16px', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '800', color: 'var(--color-brand)', fontSize: '15px' }}>{b.certificateNumber}</span>
                    <span className={`badge ${statusColors[b.status] || 'badge-pending'}`} style={{ padding: '4px 8px', fontSize: '10px' }}>
                      {b.status}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    <strong>Exportador:</strong> {exp ? exp.name : 'N/A'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    <div><Calendar size={12} style={{ marginRight: '4px' }} /> Início: {b.startDate}</div>
                    <div><Calendar size={12} style={{ marginRight: '4px' }} /> Lançamento: {b.launchDate || b.startDate}</div>
                    <div style={{ gridColumn: '1 / -1' }}><MapPin size={12} style={{ marginRight: '4px' }} /> {loc ? loc.name : 'N/A'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Navio:</strong> {b.vesselVoyage}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Containers:</strong> {b.containers?.length || 0} | <strong>Sacas:</strong> {b.bagsQuantity}</div>
                  </div>

                  {user.role === 'ADM' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => onSelectBooking(b.id)} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}>
                        Ver Detalhes
                      </button>
                      <button onClick={(e) => handleDelete(b.id, e)} className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '12px' }}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>
              Nenhum booking cadastrado ou encontrado na busca.
            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media(min-width: 769px) {
          .desktop-only-table { display: block !important; }
          .mobile-only-cards { display: none !important; }
        }
        @media(max-width: 768px) {
          .desktop-only-table { display: none !important; }
          .mobile-only-cards { display: flex !important; }
        }
      `}} />
    </PullToRefresh>
  );
}
