import { useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ onRefresh, children }) {
  const [startY, setStartY] = useState(0);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);

  const pullThreshold = 70;

  const handleTouchStart = (e) => {
    // Só ativa se estiver no topo do scroll
    if (containerRef.current && containerRef.current.scrollTop === 0 && !refreshing) {
      setStartY(e.touches[0].pageY);
    } else {
      setStartY(0);
    }
  };

  const handleTouchMove = (e) => {
    if (startY === 0 || refreshing) return;

    const currentY = e.touches[0].pageY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Aplica uma resistência (escala logarítmica ou fracionária)
      const offset = Math.min(diff * 0.4, 120);
      setPullOffset(offset);
      // Evita o scroll padrão do navegador
      if (offset > 10 && e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (startY === 0 || refreshing) return;

    if (pullOffset >= pullThreshold) {
      triggerRefresh();
    } else {
      // Volta ao topo suavemente
      setPullOffset(0);
    }
    setStartY(0);
  };

  const triggerRefresh = () => {
    setRefreshing(true);
    setPullOffset(pullThreshold);
    
    // Executa callback
    onRefresh().then(() => {
      // Delay suave para feedback visual antes de sumir
      setTimeout(() => {
        setRefreshing(false);
        setPullOffset(0);
      }, 800);
    }).catch(() => {
      setRefreshing(false);
      setPullOffset(0);
    });
  };

  return (
    <div 
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        height: '100%',
        overflowY: 'auto',
        width: '100%',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Pull Indicator */}
      <div style={{
        position: 'absolute',
        top: `${pullOffset - 50}px`,
        left: 0,
        right: 0,
        height: '50px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pullOffset > 10 ? 1 : 0,
        transition: refreshing ? 'top 0.2s ease, opacity 0.2s ease' : 'none',
        zIndex: 50,
        pointerEvents: 'none'
      }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-full)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: 'var(--shadow-md)',
          color: pullOffset >= pullThreshold ? 'var(--color-brand)' : 'var(--text-secondary)'
        }}>
          <RefreshCw 
            size={16} 
            className={refreshing ? 'rotating' : ''} 
            style={{
              transform: refreshing ? 'none' : `rotate(${pullOffset * 3}deg)`,
              transition: refreshing ? 'none' : 'transform 0.1s linear',
              animation: refreshing ? 'spin 1s linear infinite' : 'none'
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: '600' }}>
            {refreshing ? 'Atualizando...' : pullOffset >= pullThreshold ? 'Solte para atualizar' : 'Puxe para atualizar'}
          </span>
        </div>
      </div>

      {/* Estilo para animação de rotação */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />

      {/* Conteúdo Principal */}
      <div style={{
        transform: `translateY(${refreshing ? pullThreshold : pullOffset}px)`,
        transition: startY === 0 ? 'transform 0.2s ease' : 'none',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {children}
      </div>
    </div>
  );
}
