import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Share2, Download } from 'lucide-react';
import PhotoDownloadButton from './PhotoDownloadButton';
import { canSharePhotoFile } from '../utils/photoDownload.js';

/**
 * Modal visualizador de foto ampliada no estilo Google Fotos.
 * Oferece barra superior com identificação do container, download individual com alta qualidade,
 * botão de compartilhamento para APK/celular e navegação entre as fotos.
 */
export default function PhotoEnlargedModal({
  photo,
  photos = [],
  currentIndex = 0,
  containerNumber = '',
  date = null,
  onClose,
  onNavigate
}) {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // Detecta se o aparelho/browser suporta compartilhamento de arquivos nativo
    setCanShare(canSharePhotoFile());
  }, []);

  // Navegação por teclado: Escape fecha, setas navegam
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
      } else if (e.key === 'ArrowLeft') {
        if (photos.length > 1 && currentIndex > 0 && onNavigate) {
          onNavigate(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (photos.length > 1 && currentIndex < photos.length - 1 && onNavigate) {
          onNavigate(currentIndex + 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, photos, onClose, onNavigate]);

  const activePhoto = photo || (photos.length > 0 ? photos[currentIndex] : null);
  const photoUrl = activePhoto?.url || activePhoto?.dataUrl || (typeof activePhoto === 'string' ? activePhoto : null);

  if (!photoUrl) return null;

  const totalPhotos = photos.length || 1;
  const currentIdxNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de Foto Ampliada"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.96)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 10000,
        padding: '12px 16px',
        boxSizing: 'border-box',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
      className="no-print"
    >
      {/* ── BARRA SUPERIOR (ESTILO GOOGLE FOTOS) ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          color: '#ffffff',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Identificação do Container e Contador */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                backgroundColor: 'rgba(59, 130, 246, 0.25)',
                color: '#60a5fa',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(59, 130, 246, 0.4)'
              }}
            >
              Container
            </span>
            <strong style={{ fontSize: '16px', letterSpacing: '0.03em' }}>
              {containerNumber || 'Identificação'}
            </strong>
          </div>
          {totalPhotos > 1 && (
            <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Foto {currentIdxNumber} de {totalPhotos}
            </span>
          )}
        </div>

        {/* Ações: Download, Compartilhar e Fechar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Botão Baixar Foto */}
          <PhotoDownloadButton
            photo={activePhoto}
            containerNumber={containerNumber}
            index={currentIndex}
            date={date}
            variant="button"
            label="Baixar foto"
          />

          {/* Botão Compartilhar Foto (Disponível no celular/tablet/APK ou navegadores compatíveis) */}
          {canShare && (
            <PhotoDownloadButton
              photo={activePhoto}
              containerNumber={containerNumber}
              index={currentIndex}
              date={date}
              variant="share"
              label="Compartilhar"
            />
          )}

          {/* Botão Fechar */}
          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            aria-label="Fechar visualizador"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── ÁREA CENTRAL DA IMAGEM COM SETAS DE NAVEGAÇÃO ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '16px 0',
          overflow: 'hidden'
        }}
      >
        {/* Seta Anterior */}
        {photos.length > 1 && currentIndex > 0 && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(currentIndex - 1)}
            aria-label="Foto anterior"
            title="Foto anterior"
            style={{
              position: 'absolute',
              left: '12px',
              zIndex: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              transition: 'transform 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Imagem Ampliada */}
        <img
          src={photoUrl}
          alt={`Foto ${currentIdxNumber} do container ${containerNumber}`}
          style={{
            maxWidth: '100%',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        />

        {/* Seta Próxima */}
        {photos.length > 1 && currentIndex < photos.length - 1 && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(currentIndex + 1)}
            aria-label="Próxima foto"
            title="Próxima foto"
            style={{
              position: 'absolute',
              right: '12px',
              zIndex: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              transition: 'transform 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* ── FAIXA INFERIOR DE MINIATURAS (SE HOUVER MAIS DE UMA FOTO) ── */}
      {photos.length > 1 && onNavigate && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingTop: '8px',
            paddingBottom: '4px',
            maxWidth: '100%'
          }}
        >
          {photos.map((p, idx) => {
            const thumbUrl = p.url || p.dataUrl || (typeof p === 'string' ? p : null);
            const isSelected = idx === currentIndex;
            return (
              <button
                key={p.id || idx}
                type="button"
                onClick={() => onNavigate(idx)}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
                  opacity: isSelected ? 1 : 0.55,
                  padding: 0,
                  cursor: 'pointer',
                  backgroundColor: '#000',
                  flexShrink: 0,
                  transition: 'opacity 0.15s, border-color 0.15s'
                }}
              >
                {thumbUrl && (
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
