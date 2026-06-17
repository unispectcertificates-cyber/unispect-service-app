import { useState } from 'react';
import { Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import { db } from '../db';

export default function Login({ onLogin }) {
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginVal.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const allUsers = await db.getUsers();
      const matched = allUsers.find(
        (u) =>
          u.login.trim().toLowerCase() === loginVal.trim().toLowerCase() &&
          u.password === password
      );

      if (matched) {
        db.setUser(matched);
        onLogin(matched);
      } else {
        setError('Usuário ou senha incorretos.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Erro de conexão com o banco de dados. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%)',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        padding: '20px',
        overflow: 'auto',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '40px 32px',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          backdropFilter: 'blur(16px)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Logo Unispect */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              border: '2px solid var(--color-brand)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '1',
              fontWeight: 'bold',
              borderRadius: '4px',
              backgroundColor: 'var(--color-brand-light)',
            }}
          >
            <span style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '2px', color: 'var(--text-primary)' }}>UN</span>
            <span style={{ fontSize: '9px', fontWeight: '800', marginTop: '3px', letterSpacing: '1px', color: 'var(--color-brand)' }}>UNISPECT</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <h2
              style={{
                fontSize: '20px',
                fontFamily: 'var(--font-display)',
                fontWeight: '700',
                color: 'var(--text-primary)',
                letterSpacing: '0.5px',
              }}
            >
              Unispect Service
            </h2>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Portal de Acesso
            </span>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--color-danger-light)',
                border: '1px solid var(--color-danger)',
                padding: '10px 12px',
                borderRadius: '6px',
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label style={{ color: 'var(--text-muted)' }}>Usuário / Login</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                value={loginVal}
                onChange={(e) => setLoginVal(e.target.value)}
                placeholder="Ex: admin"
                disabled={isLoading}
                required
                style={{
                  paddingLeft: '38px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  height: '44px',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)' }}>Senha</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                disabled={isLoading}
                required
                style={{
                  paddingLeft: '38px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  height: '44px',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{
              height: '44px',
              fontSize: '14px',
              fontWeight: '700',
              marginTop: '10px',
              boxShadow: 'var(--shadow-glow)',
              width: '100%',
              backgroundColor: 'var(--color-brand)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="rotating" />
                <span>Autenticando...</span>
              </>
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rotating {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}
