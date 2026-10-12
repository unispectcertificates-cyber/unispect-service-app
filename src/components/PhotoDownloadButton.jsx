import React, { useState } from 'react';
import { Download, Share2, Check, AlertCircle, Loader2, RotateCw } from 'lucide-react';
import { downloadPhotoFile, shareOrDownloadPhotoFile, canSharePhotoFile, buildPhotoFilename } from '../utils/photoDownload.js';

/**
 * Componente de download de foto individual no estilo Google Fotos.
 * Suporta miniatura (ícone discreto flutuante), botão com texto e compartilhamento nativo para celular/APK.
 */
export default function PhotoDownloadButton({
  photo,
  containerNumber = '',
  index = 0,
  date = null,
  variant = 'thumbnail', // 'thumbnail' | 'button' | 'icon' | 'share'
  label = 'Baixar foto',
  className = '',
  style = {},
  title = 'Baixar foto original (sem marca d\'água)'
}) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadedName, setDownloadedName] = useState('');
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);

  const handleAction = async (e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    if (status === 'loading') return;

    setStatus('loading');
    setErrorMessage('');
    setShowErrorTooltip(false);

    try {
      let res;
      if (variant === 'share') {
        res = await shareOrDownloadPhotoFile({ photo, containerNumber, index, date });
      } else {
        res = await downloadPhotoFile({ photo, containerNumber, index, date });
      }

      if (res && res.cancelled) {
        setStatus('idle');
        return;
      }

      setDownloadedName(res?.filename || '');
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
      }, 2500);
    } catch (err) {
      console.error('Erro ao baixar/compartilhar foto:', err);
      const msg = err?.message || 'Falha ao baixar foto. Verifique a conexão.';
      setErrorMessage(msg);
      setStatus('error');
      setShowErrorTooltip(true);
    }
  };

  // 1. VARIANTE MINIATURA (Ícone discreto Google Fotos no canto da foto)
  if (variant === 'thumbnail') {
    return (
      <div
        className="photo-download-thumbnail-wrapper"
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          ...style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleAction}
          disabled={status === 'loading'}
          title={status === 'error' ? errorMessage : (status === 'success' ? `Baixado: ${downloadedName}` : title)}
          aria-label={title}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: status === 'error'
              ? 'rgba(239, 68, 68, 0.92)'
              : status === 'success'
                ? 'rgba(16, 185, 129, 0.92)'
                : 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
            padding: 0
          }}
          onMouseEnter={(e) => {
            if (status === 'idle') e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {status === 'loading' && (
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {status === 'success' && (
            <Check size={15} style={{ strokeWidth: 3 }} />
          )}
          {status === 'error' && (
            <AlertCircle size={15} />
          )}
          {status === 'idle' && (
            <Download size={14} />
          )}
        </button>

        {/* Tooltip / Balão de Erro com Tentar Novamente */}
        {status === 'error' && showErrorTooltip && (
          <div
            style={{
              position: 'absolute',
              top: '34px',
              right: '0',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '11px',
              width: '180px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              zIndex: 10,
              lineHeight: 1.3
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: '#fca5a5', fontWeight: 'bold', marginBottom: '4px' }}>
              Não foi possível baixar
            </div>
            <div style={{ marginBottom: '6px', opacity: 0.9 }}>
              {errorMessage}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
              <button
                type="button"
                onClick={handleAction}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RotateCw size={10} /> Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => setShowErrorTooltip(false)}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  fontSize: '10px',
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. VARIANTE ÍCONE (Apenas botão redondo para barras de ferramentas)
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleAction}
        disabled={status === 'loading'}
        className={`btn-icon ${className}`}
        title={status === 'error' ? errorMessage : title}
        aria-label={title}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: status === 'error'
            ? 'rgba(239, 68, 68, 0.25)'
            : status === 'success'
              ? 'rgba(16, 185, 129, 0.25)'
              : 'rgba(255, 255, 255, 0.15)',
          color: status === 'error' ? '#f87171' : status === 'success' ? '#34d399' : '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: status === 'loading' ? 'wait' : 'pointer',
          transition: 'all 0.18s ease-in-out',
          padding: 0,
          ...style
        }}
      >
        {status === 'loading' && (
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {status === 'success' && (
          <Check size={18} style={{ strokeWidth: 2.5 }} />
        )}
        {status === 'error' && (
          <AlertCircle size={18} />
        )}
        {status === 'idle' && (
          <Download size={18} />
        )}
      </button>
    );
  }

  // 3. VARIANTE BOTÃO PADRÃO (Com ícone e rótulo de texto)
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', ...style }}>
      <button
        type="button"
        onClick={handleAction}
        disabled={status === 'loading'}
        className={`btn ${className}`}
        title={status === 'error' ? errorMessage : title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          backgroundColor: status === 'error'
            ? '#ef4444'
            : status === 'success'
              ? '#10b981'
              : variant === 'share'
                ? '#2563eb'
                : 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          cursor: status === 'loading' ? 'wait' : 'pointer',
          transition: 'all 0.18s ease-in-out'
        }}
      >
        {status === 'loading' && (
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {status === 'success' && (
          <Check size={16} style={{ strokeWidth: 2.5 }} />
        )}
        {status === 'error' && (
          <RotateCw size={16} />
        )}
        {status === 'idle' && (
          variant === 'share' ? <Share2 size={16} /> : <Download size={16} />
        )}
        <span>
          {status === 'loading'
            ? 'Baixando foto…'
            : status === 'success'
              ? 'Foto baixada!'
              : status === 'error'
                ? 'Tentar novamente'
                : label}
        </span>
      </button>

      {/* Mensagem de Erro Inline */}
      {status === 'error' && (
        <div
          style={{
            marginTop: '6px',
            color: '#f87171',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <AlertCircle size={12} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
