import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeEnvironment, PRODUCTION_PROJECT_ID } from '../src/utils/environmentGuard.js';

test('1. Trava de Segurança: Bloqueia execução em localhost se apontar para produção sem emulador', () => {
  assert.throws(
    () => {
      assertSafeEnvironment({
        hostname: 'localhost',
        projectId: PRODUCTION_PROJECT_ID,
        isEmulatorActive: false
      });
    },
    /BLOQUEIO FATAL DE SEGURANÇA/,
    'Deve abortar imediatamente quando localhost tenta conectar a produção sem emulador'
  );
});

test('2. Trava de Segurança: Bloqueia ambiente de staging se apontar para o projectId de produção', () => {
  assert.throws(
    () => {
      assertSafeEnvironment({
        hostname: 'staging.unispect.com',
        appEnv: 'staging',
        projectId: PRODUCTION_PROJECT_ID,
        isEmulatorActive: false
      });
    },
    /BLOQUEIO FATAL DE SEGURANÇA/,
    'Deve abortar staging apontando para projeto de produção'
  );
});

test('3. Liberação Segura: Permite execução local quando emulador está explicitamente ativado', () => {
  const check = assertSafeEnvironment({
    hostname: 'localhost',
    projectId: PRODUCTION_PROJECT_ID,
    isEmulatorActive: true
  });

  assert.equal(check.safe, true);
  assert.equal(check.mode, 'emulator');
});

test('4. Liberação Segura: Permite staging quando apontando para projeto isolado de staging', () => {
  const check = assertSafeEnvironment({
    hostname: 'staging.unispect.com',
    appEnv: 'staging',
    projectId: 'unispect-service-staging',
    isEmulatorActive: false
  });

  assert.equal(check.safe, true);
  assert.equal(check.mode, 'staging');
});
