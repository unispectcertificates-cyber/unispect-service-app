import { useState } from 'react';
import { Search, Plus, Clipboard, Loader2, PlayCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { db } from '../db';
import PullToRefresh from './PullToRefresh';

export default function Dashboard({ user, onSelectBooking, onCreateBookingClick }) {
  const [bookings, setBookings] = useState(db.getBookings());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Recarrega dados com simulação de rede (Pull-to-refresh)
  const handleRefresh = () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        setBookings(db.getBookings());
        resolve();
      }, 1000);
    });
  };

  // Cálculos de Status
  const pendentes = bookings.filter(b => b.status === 'Pendente').length;
  const andamento = bookings.filter(b => b.status === 'Em andamento').length;
  const finalizados = bookings.filter(b => b.status === 'Finalizado').length;

  // Busca por Booking ou Container
  const filteredBookings = bookings.filter(b => {
    const term = searchQuery.toLowerCase();
    if (!term) return true;

    const matchBooking = b.bookingNumber.toLowerCase().includes(term) || 
                         b.certificateNumber.toLowerCase().includes(term);
                         
    const matchContainer = b.containers?.some(c => 
      c.containerNumber.toLowerCase().includes(term)
    );

    return matchBooking || matchContainer;
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div style={{ padding: '32px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Topo do Dashboard */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Logo e Nome da Empresa no topo do dashboard com degradê */}
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-brand-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              color: '#fff',
              fontWeight: '800',
              fontSize: '22px'
            }}>
              UN
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: '800', lineHeight: '1.15' }}>Unispect Service</h1>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>Controle Operacional e Estufagem</span>
            </div>
          </div>

          {user.role === 'ADM' && (
            <button onClick={onCreateBookingClick} className="btn btn-primary" style={{ boxShadow: 'var(--shadow-glow)' }}>
              <Plus size={16} /> Novo Booking
            </button>
          )}
        </div>

        {/* Busca por Booking ou Container */}
        <div className="glass-panel" style={{ 
          padding: '16px 20px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <Search size={20} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar por Booking, Certificado ou número do Container..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              border: 'none', 
              padding: '4px 0', 
              fontSize: '15px', 
              backgroundColor: 'transparent',
              boxShadow: 'none',
              width: '100%'
            }}
          />
        </div>

        {/* Status dos Bookings - Visual Premium */}
        <div>
          <h2 style={{ marginBottom: '16px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
            Status Operacionais
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px'
          }}>
            {/* Card Pendentes */}
            <div className="glass-panel" style={{ 
              padding: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderLeft: '4px solid var(--color-warning)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pendentes</span>
                <h3 style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px', lineHeight: 1 }}>{pendentes}</h3>
              </div>
              <div style={{ 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--color-warning-light)', 
                color: 'var(--color-warning)'
              }}>
                <Loader2 size={24} />
              </div>
            </div>

            {/* Card Em andamento */}
            <div className="glass-panel" style={{ 
              padding: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderLeft: '4px solid var(--color-brand)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Em Andamento</span>
                <h3 style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px', lineHeight: 1 }}>{andamento}</h3>
              </div>
              <div style={{ 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--color-brand-light)', 
                color: 'var(--color-brand)'
              }}>
                <PlayCircle size={24} />
              </div>
            </div>

            {/* Card Finalizados */}
            <div className="glass-panel" style={{ 
              padding: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderLeft: '4px solid var(--color-success)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Finalizados</span>
                <h3 style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px', lineHeight: 1 }}>{finalizados}</h3>
              </div>
              <div style={{ 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--color-success-light)', 
                color: 'var(--color-success)'
              }}>
                <CheckCircle size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Bookings Recentes ou Filtrados */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {searchQuery ? 'Resultados da Busca' : 'Todos os Bookings / Certificados'}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '700' }}>{filteredBookings.length} encontrados</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredBookings.map(b => {
              const exp = db.getExportadores().find(e => e.id === b.exporterId);
              const statusColors = {
                'Pendente': 'badge-pending',
                'Em andamento': 'badge-progress',
                'Finalizado': 'badge-success'
              };

              return (
                <div 
                  key={b.id} 
                  className="glass-panel" 
                  onClick={() => onSelectBooking(b.id)}
                  style={{ 
                    padding: '20px 24px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    transition: 'var(--transition-all)',
                    borderLeft: '4px solid transparent',
                    border: '1px solid var(--border-glass)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--color-brand)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-glass)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '800', fontSize: '16px', color: 'var(--color-brand)', fontFamily: 'var(--font-display)' }}>
                        {b.certificateNumber}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>Booking: {b.bookingNumber}</span>
                      <span className={`badge ${statusColors[b.status] || 'badge-pending'}`}>
                        {b.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                      Exportador: <strong style={{ color: 'var(--text-primary)' }}>{exp ? exp.name : 'N/A'}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap', marginTop: '4px', fontWeight: '600' }}>
                      <span>Navio: <strong style={{ color: 'var(--text-secondary)' }}>{b.vesselVoyage}</strong></span>
                      <span>Containers: <strong style={{ color: 'var(--text-secondary)' }}>{b.containers?.length || 0}</strong></span>
                      <span>Sacas: <strong style={{ color: 'var(--text-secondary)' }}>{b.bagsQuantity}</strong></span>
                    </div>
                  </div>

                  <div style={{ 
                    color: 'var(--color-brand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    transition: 'var(--transition-fast)'
                  }}
                    className="arrow-container"
                  >
                    <ArrowRight size={18} />
                  </div>
                </div>
              );
            })}

            {filteredBookings.length === 0 && (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)' }}>
                <Clipboard size={44} style={{ marginBottom: '12px', opacity: 0.5, color: 'var(--color-brand)' }} />
                <p style={{ fontWeight: '600', fontSize: '15px' }}>Nenhum booking encontrado.</p>
                <p style={{ fontSize: '13px', marginTop: '4px' }}>Verifique os termos da busca ou adicione um novo registro.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </PullToRefresh>
  );
}
