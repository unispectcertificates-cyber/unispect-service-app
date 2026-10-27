import { useState } from 'react';
import { Lock, Mail, AlertCircle, CheckCircle2, Loader2, ArrowLeft, Shield } from 'lucide-react';
import { loginWithEmail, sendPasswordReset } from '../utils/authService';

export default function Login({ onLogin, initialMessage = null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialMessage || '');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Mapeamento explícito de contas fictícias EXCLUSIVO do laboratório local (Emulador).
  // Não presume e-mails dos quatro usuários reais de produção.
  const LAB_DEMO_ACCOUNTS = {
    'master': 'master@unispect.com',
    'carlos': 'carlos@interport.com.br',
    'admin-interport': 'admin@interport.com.br',
    'exportador-atlantica': 'exportador@cafeatlantica.com.br',
    'sem-cargo': 'semcargo@interport.com.br'
  };

  const resolveEmail = (input) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) {
      return trimmed.toLowerCase();
    }
    // Atalho exclusivo para facilitar testes no emulador local
    const key = trimmed.toLowerCase();
    if (isLocal && LAB_DEMO_ACCOUNTS[key]) {
      return LAB_DEMO_ACCOUNTS[key];
    }
    // Não presume domínio: exige e-mail completo
    throw new Error('Informe um endereço de e-mail completo (exemplo: usuario@empresa.com.br).');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }

    setError('');
    setInfoMessage('');
    setIsLoading(true);

    try {
      const targetEmail = resolveEmail(email);
      const result = await loginWithEmail(targetEmail, password);
      if (result.success && onLogin) {
        onLogin(result.user);
      }
    } catch (err) {
      setError(err.message || 'Erro ao efetuar login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setError('Informe o e-mail para recuperação.');
      return;
    }

    setError('');
    setInfoMessage('');
    setIsLoading(true);

    try {
      const targetEmail = resolveEmail(forgotEmail);
      const res = await sendPasswordReset(targetEmail);
      setInfoMessage(res.message);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o e-mail de recuperação.');
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
          maxWidth: '420px',
          width: '100%',
          padding: '36px 32px',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          backdropFilter: 'blur(16px)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Identificação de Ambiente Isolado */}
        {isLocal && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#ecfdf5',
              border: '1px solid #10b981',
              color: '#065f46',
              fontSize: '11px',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '20px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            <Shield size={13} />
            <span>Ambiente Local Isolado (Auth: 9099)</span>
          </div>
        )}

        {/* Logo Unispect */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
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
          <div style={{ textAlign: 'center', marginTop: '2px' }}>
            <h2
              style={{
                fontSize: '20px',
                fontFamily: 'var(--font-display)',
                fontWeight: '700',
                color: 'var(--text-primary)',
                letterSpacing: '0.5px',
                margin: 0,
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
              Autenticação Segura
            </span>
          </div>
        </div>

        {/* Mensagens de Erro ou Confirmação */}
        {error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              backgroundColor: 'var(--color-danger-light)',
              border: '1px solid var(--color-danger)',
              padding: '10px 12px',
              borderRadius: '6px',
              color: 'var(--color-danger)',
              fontSize: '13px',
              fontWeight: '600',
              lineHeight: '1.4'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              backgroundColor: '#ecfdf5',
              border: '1px solid #10b981',
              padding: '10px 12px',
              borderRadius: '6px',
              color: '#065f46',
              fontSize: '13px',
              fontWeight: '600',
              lineHeight: '1.4'
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {!showForgot ? (
          /* Formulário de Login Principal */
          <form onSubmit={handleLoginSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                E-mail ou Usuário
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: admin@interport.com.br ou admin"
                  disabled={isLoading}
                  autoComplete="username"
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '38px',
                    paddingRight: '12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    height: '42px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setError(''); setInfoMessage(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '12px',
                    color: 'var(--color-brand)',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Esqueci minha senha
                </button>
              </div>
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
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '38px',
                    paddingRight: '12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    height: '42px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
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
                marginTop: '6px',
                boxShadow: 'var(--shadow-glow)',
                width: '100%',
                backgroundColor: 'var(--color-brand)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
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
        ) : (
          /* Formulário de Recuperação de Senha */
          <form onSubmit={handleForgotSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'left', width: '100%' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                Recuperação de Acesso
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                Digite o e-mail cadastrado para receber as instruções de redefinição de senha.
              </p>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                E-mail Cadastrado
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="ex: seuemail@interport.com.br"
                  disabled={isLoading}
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '38px',
                    paddingRight: '12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    height: '42px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
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
                marginTop: '6px',
                backgroundColor: 'var(--color-brand)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
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
                  <span>Enviando...</span>
                </>
              ) : (
                'Enviar Link de Redefinição'
              )}
            </button>

            <button
              type="button"
              onClick={() => { setShowForgot(false); setError(''); setInfoMessage(''); }}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                marginTop: '4px'
              }}
            >
              <ArrowLeft size={14} />
              <span>Voltar para o Login</span>
            </button>
          </form>
        )}
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
