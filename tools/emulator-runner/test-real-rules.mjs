import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

console.log('[TESTE REAL DE REGRAS] Tentando inicializar ambiente de teste de regras reais contra o emulador...');

try {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-unispect-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8')
    }
  });

  console.log('[SUCESSO] Conectado com sucesso ao Emulador de Firestore!');
  await testEnv.cleanup();
} catch (err) {
  console.error('[PENDÊNCIA IDENTIFICADA]:', err.message);
  if (err.cause) console.error('Causa:', err.cause);
}
