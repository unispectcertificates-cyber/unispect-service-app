import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function BottomDrawer({ isOpen, onClose, title, options, selectedValue, onChange }) {
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [animate, setAnimate] = useState(false);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setShouldRender(true);
    } else {
      setAnimate(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      // Pequeno delay para acionar a transição CSS
      const timer = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleSelect = (value) => {
    onChange(value);
    onClose();
  };

  return (
    <div className="no-select" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      pointerEvents: isOpen ? 'auto' : 'none'
    }}>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          opacity: animate ? 1 : 0,
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 1
        }}
      />

      {/* Drawer Panel */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '500px',
        backgroundColor: 'var(--bg-secondary)',
        borderTopLeftRadius: 'var(--radius-lg)',
        borderTopRightRadius: 'var(--radius-lg)',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.15)',
        transform: animate ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        paddingBottom: 'calc(20px + var(--safe-area-bottom))',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2
      }}>
        {/* Drag Handle Bar */}
        <div style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 0 6px'
        }}>
          <div style={{
            width: '40px',
            height: '4px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--border-color)'
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px 16px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700' }}>{title}</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'var(--bg-tertiary)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Options List */}
        <div style={{
          overflowY: 'auto',
          padding: '8px 0'
        }}>
          {options.map((opt) => {
            const isSelected = opt.value === selectedValue;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: '15px',
                  color: isSelected ? 'var(--color-brand)' : 'var(--text-primary)',
                  fontWeight: isSelected ? '700' : '500',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-brand-light)' : 'transparent',
                  borderBottom: '1px solid var(--bg-primary)',
                  transition: 'background-color 0.15s ease'
                }}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-brand)'
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
