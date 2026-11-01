import { useState } from 'react';
import { Lock, User, AlertCircle, CheckCircle2, Loader2, ArrowLeft, Shield, HelpCircle, Mail } from 'lucide-react';
import { loginWithEmail, sendPasswordReset } from '../utils/authService';

export default function Login({ onLogin, initialMessage = null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialMessage || '');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Preencha o usuário e a senha.');
      return;
    }

    setError('');
    setInfoMessage('');
    setIsLoading(true);

    try {
      // Envia o usuário e a senha digitada diretamente (sem alterações ou substituições no frontend)
      const result = await loginWithEmail(username, password);
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
      const res = await sendPasswordReset(forgotEmail.trim());
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
              Acesso Corporativo Interno
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
          /* Formulário de Login: Usuário e Senha */
          <form onSubmit={handleLoginSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Usuário
              </label>
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite seu usuário Unispect (ex: admin)"
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
          /* Recuperação de Acesso e Procedimento Administrativo */
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'left', width: '100%' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                Recuperação de Acesso
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                Colaboradores internos da Unispect possuem identificação corporativa única.
              </p>
            </div>

            {/* Caixa Informativa do Procedimento Administrativo */}
            <div style={{
              backgroundColor: 'rgba(226, 178, 62, 0.08)',
              border: '1px solid rgba(226, 178, 62, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-brand)', fontSize: '12px', fontWeight: '700' }}>
                <HelpCircle size={15} />
                <span>Procedimento Administrativo (Sem e-mail cadastrado):</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                Como o acesso é interno e gerenciado pela Unispect, caso tenha esquecido sua senha ou necessite de primeiro acesso:
              </p>
              <ol style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 0 16px', padding: 0, lineHeight: '1.4' }}>
                <li>Contate o Administrador/Supervisor Unispect ou setor de TI.</li>
                <li>Solicite a redefinição de acesso ou definição de senha provisória.</li>
                <li>Após efetuar login, altere sua senha no menu do sistema.</li>
              </ol>
            </div>

            {/* Envio por E-mail (caso o usuário possua recuperação configurada) */}
            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Ou informe seu e-mail de recuperação cadastrado:
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="ex: seu.email@empresa.com"
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      paddingLeft: '38px',
                      paddingRight: '12px',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)',
                      height: '40px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-secondary"
                disabled={isLoading || !forgotEmail.trim()}
                style={{
                  height: '38px',
                  fontSize: '13px',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: forgotEmail.trim() ? 'pointer' : 'not-allowed',
                  opacity: forgotEmail.trim() ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="rotating" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  'Enviar Link por E-mail'
                )}
              </button>
            </form>

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
          </div>
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
