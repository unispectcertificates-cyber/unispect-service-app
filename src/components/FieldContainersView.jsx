import { useState, useEffect } from 'react';
import { PackagePlus, Search, Trash2, Eye, X, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { subscribePendingFieldContainers, deleteFieldContainer } from '../utils/fieldService';
import { getSealText } from '../db';
import PhotoDownloadButton from './PhotoDownloadButton';
import { canSharePhotoFile } from '../utils/photoDownload';

export default function FieldContainersView({ user }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal de Fotos (Lightbox)
  const [lightboxContainer, setLightboxContainer] = useState(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Modal de Confirmação de Exclusão
  const [containerToDelete, setContainerToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isAdm = String(user?.role || '').trim().toUpperCase() === 'ADM';

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribePendingFieldContainers(
      (records) => {
        setContainers(records);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Erro ao escutar containers sem Booking:', err);
        setError('Não foi possível carregar os containers em tempo real. Verifique a conexão.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fechar lightbox com Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!lightboxContainer) return;
      if (e.key === 'Escape') setLightboxContainer(null);
      if (e.key === 'ArrowRight') handleNextPhoto();
      if (e.key === 'ArrowLeft') handlePrevPhoto();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxContainer, activePhotoIdx]);

  const filteredContainers = containers.filter(c => {
    if (!search.trim()) return true;
    const query = search.trim().toUpperCase().replace(/[\s-]/g, '');
    const num = String(c.id || c.normalizedNumber || '').toUpperCase().replace(/[\s-]/g, '');
    return num.includes(query);
  });

  const canDeleteContainer = (item) => {
    if (isAdm) return true;
    const actor = item.container?.fieldCapture?.actor;
    if (!actor) return false;
    const currentId = String(user?.id || '');
    const currentName = String(user?.name || user?.username || '').trim().toLowerCase();
    const currentLogin = String(user?.login || '').trim().toLowerCase();
    return Boolean(
      (currentId && actor.id && String(actor.id) === currentId) ||
      (currentName && actor.name && String(actor.name).trim().toLowerCase() === currentName) ||
      (currentLogin && actor.login && String(actor.login).trim().toLowerCase() === currentLogin)
    );
  };

  const handleOpenLightbox = (item, initialIdx = 0) => {
    setLightboxContainer(item);
    setActivePhotoIdx(initialIdx);
  };

  const handleNextPhoto = () => {
    if (!lightboxContainer) return;
    const total = lightboxContainer.container?.photos?.length || 0;
    if (total <= 1) return;
    setActivePhotoIdx(prev => (prev + 1) % total);
  };

  const handlePrevPhoto = () => {
    if (!lightboxContainer) return;
    const total = lightboxContainer.container?.photos?.length || 0;
    if (total <= 1) return;
    setActivePhotoIdx(prev => (prev - 1 + total) % total);
  };

  const handleOpenDeleteModal = (item) => {
    setDeleteError('');
    setContainerToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!containerToDelete) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const num = containerToDelete.id || containerToDelete.normalizedNumber;
      await deleteFieldContainer(num, user);
      setSuccessMessage(`Container ${num} e suas fotos foram excluídos com sucesso.`);
      setContainerToDelete(null);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Erro ao excluir container:', err);
      setDeleteError(err.message || 'Erro ao excluir o container sem Booking.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
            }}>
              <PackagePlus size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: '800', margin: 0 }}>
                Containers sem Booking
              </h1>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Conferências de campo sincronizadas aguardando vinculação ao romaneio
              </span>
            </div>
          </div>
        </div>

        {/* Contador em destaque */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '12px',
            fontWeight: '700',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            background: containers.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-tertiary)',
            color: containers.length > 0 ? '#10b981' : 'var(--text-muted)',
            border: `1px solid ${containers.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Clock size={14} />
            {containers.length} {containers.length === 1 ? 'pendente de vínculo' : 'pendentes de vínculo'}
          </span>
        </div>
      </div>

      {/* Mensagem de sucesso */}
      {successMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid #10b981',
          color: '#10b981',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar por número do container (ex: ABCD1234567)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: '13px' }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Lista / Tabela de Containers */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={28} className="rotating" style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
          <p>Carregando containers sem Booking...</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <AlertTriangle size={24} style={{ margin: '0 auto 8px' }} />
          <p style={{ fontWeight: '600' }}>{error}</p>
        </div>
      ) : filteredContainers.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
          <PackagePlus size={44} style={{ margin: '0 auto 12px', opacity: 0.4, color: 'var(--color-brand)' }} />
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
            {search ? 'Nenhum container encontrado para esta busca' : 'Nenhum container sem Booking pendente'}
          </h3>
          <p style={{ fontSize: '13px', maxWidth: '500px', margin: '0 auto' }}>
            {search
              ? 'Tente pesquisar usando outros caracteres do número do container.'
              : 'Todos os containers inseridos no campo já foram vinculados a um Booking no sistema ou nenhum foi cadastrado ainda.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filteredContainers.map(item => {
            const cont = item.container || {};
            const num = item.id || item.normalizedNumber || cont.containerNumber;
            const actorName = cont.fieldCapture?.actor?.name || 'Não informado';
            const captureDate = cont.fieldCapture?.createdAt || item.createdAt;
            const dateStr = captureDate ? new Date(captureDate).toLocaleString('pt-BR') : 'Data não informada';
            const photos = cont.photos || [];
            const canDel = canDeleteContainer(item);

            const sealDisplay = cont.definiteSeal
              ? `Definitivo: ${getSealText(cont.definiteSeal)}`
              : cont.provisionalSeals?.length
              ? `Provisório: ${getSealText(cont.provisionalSeals[0])}`
              : 'Lacre não informado';

            return (
              <div
                key={item.id}
                className="glass-panel"
                style={{
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  border: '1px solid var(--border-color)',
                  position: 'relative'
                }}
              >
                {/* Cabeçalho do Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                      Container
                    </span>
                    <h3 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--color-brand)', margin: '2px 0 0', letterSpacing: '0.5px' }}>
                      {num}
                    </h3>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}>
                    Aguardando Booking
                  </span>
                </div>

                {/* Dados da Inspeção */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Tara</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{cont.tara ? `${cont.tara} kg` : '—'}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Lacre</span>
                    <strong style={{ color: 'var(--text-primary)' }} title={sealDisplay}>{sealDisplay}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Inspetor</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{actorName}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Data</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{dateStr}</strong>
                  </div>
                </div>

                {/* Miniaturas de Fotos */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      📸 Fotos ({photos.length})
                    </span>
                    {photos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenLightbox(item, 0)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-brand)',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0
                        }}
                      >
                        <Eye size={12} /> Ver fotos ampliada
                      </button>
                    )}
                  </div>

                  {photos.length === 0 ? (
                    <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                      Nenhuma foto enviada
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {photos.slice(0, 4).map((p, pIdx) => {
                        const imgUrl = p.url || p.dataUrl;
                        return (
                          <div
                            key={p.id || pIdx}
                            onClick={() => handleOpenLightbox(item, pIdx)}
                            style={{
                              width: '64px',
                              height: '64px',
                              flexShrink: 0,
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              position: 'relative'
                            }}
                            title="Clique para ampliar"
                          >
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={`Foto ${pIdx + 1} do container ${num}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                loading="lazy"
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>
                                Foto salva
                              </div>
                            )}
                            {!(pIdx === 3 && photos.length > 4) && (
                              <PhotoDownloadButton
                                photo={p}
                                containerNumber={num}
                                index={pIdx}
                                date={item.date || item.createdAt}
                                variant="thumbnail"
                                style={{ top: '2px', right: '2px' }}
                              />
                            )}
                            {pIdx === 3 && photos.length > 4 && (
                              <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.65)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: '800'
                              }}>
                                +{photos.length - 3}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Rodapé do Card: Ações */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: 'auto' }}>
                  {photos.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                      onClick={() => handleOpenLightbox(item, 0)}
                    >
                      <Eye size={14} /> Ver fotos ({photos.length})
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!canDel}
                    onClick={() => handleOpenDeleteModal(item)}
                    style={{
                      fontSize: '12px',
                      padding: '6px 12px',
                      opacity: canDel ? 1 : 0.45,
                      cursor: canDel ? 'pointer' : 'not-allowed'
                    }}
                    title={canDel ? 'Excluir container sem Booking' : 'Apenas o inspetor que cadastrou ou um ADM pode excluir'}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Lightbox (Visualizar / Ampliar Fotos) */}
      {lightboxContainer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de fotos ampliado"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '20px'
          }}
          onClick={() => setLightboxContainer(null)}
        >
          {/* Topo do Lightbox */}
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                Container: {lightboxContainer.id || lightboxContainer.normalizedNumber}
              </h3>
              <span style={{ fontSize: '12px', opacity: 0.75 }}>
                Foto {activePhotoIdx + 1} de {lightboxContainer.container?.photos?.length || 0}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PhotoDownloadButton
                photo={lightboxContainer.container?.photos?.[activePhotoIdx]}
                containerNumber={lightboxContainer.id || lightboxContainer.normalizedNumber}
                index={activePhotoIdx}
                date={lightboxContainer.date || lightboxContainer.createdAt}
                variant="button"
                label="Baixar foto"
              />
              {canSharePhotoFile() && (
                <PhotoDownloadButton
                  photo={lightboxContainer.container?.photos?.[activePhotoIdx]}
                  containerNumber={lightboxContainer.id || lightboxContainer.normalizedNumber}
                  index={activePhotoIdx}
                  date={lightboxContainer.date || lightboxContainer.createdAt}
                  variant="share"
                  label="Compartilhar"
                />
              )}
              <button
                type="button"
                onClick={() => setLightboxContainer(null)}
                className="btn btn-secondary"
                style={{ padding: '8px', color: '#fff', backgroundColor: 'rgba(255,255,255,0.15)', border: 'none' }}
                title="Fechar (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Imagem Central em Destaque */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              padding: '20px'
            }}
            onClick={e => e.stopPropagation()}
          >
            {lightboxContainer.container?.photos?.length > 1 && (
              <button
                type="button"
                onClick={handlePrevPhoto}
                style={{
                  position: 'absolute',
                  left: '12px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#fff',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 2,
                  backdropFilter: 'blur(4px)'
                }}
                title="Foto anterior (Seta esquerda)"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {(() => {
              const currentPhoto = lightboxContainer.container?.photos?.[activePhotoIdx];
              const pUrl = currentPhoto?.url || currentPhoto?.dataUrl;
              return pUrl ? (
                <img
                  src={pUrl}
                  alt={`Foto ${activePhotoIdx + 1} do container ${lightboxContainer.id}`}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '75vh',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                  }}
                />
              ) : (
                <div style={{ color: '#fff', fontSize: '14px' }}>Foto não carregada ou sem visualização disponível</div>
              );
            })()}

            {lightboxContainer.container?.photos?.length > 1 && (
              <button
                type="button"
                onClick={handleNextPhoto}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#fff',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 2,
                  backdropFilter: 'blur(4px)'
                }}
                title="Próxima foto (Seta direita)"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          {/* Miniaturas de Navegação no Rodapé */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              overflowX: 'auto',
              padding: '10px 0'
            }}
            onClick={e => e.stopPropagation()}
          >
            {lightboxContainer.container?.photos?.map((p, idx) => {
              const u = p.url || p.dataUrl;
              const isSelected = idx === activePhotoIdx;
              return (
                <div
                  key={p.id || idx}
                  onClick={() => setActivePhotoIdx(idx)}
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.3)',
                    opacity: isSelected ? 1 : 0.6,
                    transform: isSelected ? 'scale(1.08)' : 'none',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  {u ? (
                    <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#333' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {containerToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>
                  Excluir container sem Booking?
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Confirmação de remoção definitiva
                </span>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-tertiary)',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div>Container: <strong style={{ color: 'var(--color-brand)', fontSize: '15px' }}>{containerToDelete.id || containerToDelete.normalizedNumber}</strong></div>
              <div>Fotos associadas: <strong>{containerToDelete.container?.photos?.length || 0} foto(s)</strong></div>
              <div>Cadastrado por: <strong>{containerToDelete.container?.fieldCapture?.actor?.name || 'Não informado'}</strong></div>
            </div>

            <p style={{ fontSize: '13px', color: '#ef4444', margin: 0, lineHeight: 1.4 }}>
              ⚠️ <strong>Atenção:</strong> Esta ação é permanente. Todos os dados da conferência e as fotografias vinculadas serão removidos com segurança do servidor e do armazenamento.
            </p>

            {deleteError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '12px'
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setContainerToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={14} className="rotating" style={{ animation: 'spin 1s linear infinite' }} />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Confirmar Exclusão
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
