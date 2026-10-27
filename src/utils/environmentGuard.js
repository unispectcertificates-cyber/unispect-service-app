/**
 * environmentGuard.js
 * 
 * Trava ativa contra conexão acidental de ambientes de teste, desenvolvimento
 * ou homologação (staging) à base de dados de PRODUÇÃO da INTERPORT.
 * 
 * REGRAS DE DISPARO DA TRAVA:
 * 1. Se estiver rodando em localhost, 127.0.0.1 ou VITE_APP_ENV === 'staging'.
 * 2. E o projectId configurado for o de PRODUÇÃO ('unispect-service').
 * 3. E o emulador local NÃO estiver explicitamente ativado.
 * 4. AÇÃO: Interrompe imediatamente a execução lançando erro fatal e bloqueando a tela.
 */

export const PRODUCTION_PROJECT_ID = 'unispect-service';

export function assertSafeEnvironment({
  hostname = typeof window !== 'undefined' ? window.location?.hostname : 'localhost',
  appEnv = typeof process !== 'undefined' ? process.env?.VITE_APP_ENV : '',
  projectId = PRODUCTION_PROJECT_ID,
  isEmulatorActive = false
}) {
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'test';
  const isStagingEnv = appEnv === 'staging' || appEnv === 'test';

  if ((isLocalHost || isStagingEnv) && projectId === PRODUCTION_PROJECT_ID && !isEmulatorActive) {
    const errorMsg = `[BLOQUEIO FATAL DE SEGURANÇA] Tentativa de executar ambiente de desenvolvimento/teste/staging conectado diretamente ao projeto de PRODUÇÃO (${PRODUCTION_PROJECT_ID}) sem emulador local ativo. A conexão foi abortada para proteger a base da INTERPORT.`;

    if (typeof document !== 'undefined' && document.body) {
      document.body.innerHTML = `
        <div style="background:#b91c1c;color:#ffffff;padding:32px;font-family:sans-serif;font-weight:bold;line-height:1.6;border-radius:8px;margin:20px;">
          <h2>🛑 BLOQUEIO CRÍTICO DE SEGURANÇA</h2>
          <p>${errorMsg}</p>
          <p style="font-size:13px;opacity:0.9;">Para testes locais, ative o emulador com <code>localStorage.setItem('unispect_use_emulator', 'true')</code> ou aponte para um projeto de staging isolado.</p>
        </div>
      `;
    }

    throw new Error(errorMsg);
  }

  return { safe: true, mode: isEmulatorActive ? 'emulator' : (projectId === PRODUCTION_PROJECT_ID ? 'production' : 'staging') };
}
