import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { buildInventoryFromDataset, sanitizeDocument } from '../tools/inventory/create-inventory.mjs';
import { compareInventories } from '../tools/inventory/compare-inventories.mjs';

test('1. Sanitização: exclui senhas, credenciais e dados pessoais sem gerar hashes sensíveis', () => {
  const rawUser = {
    id: 'usr_1',
    login: 'carlos',
    name: 'Carlos Santos',
    email: 'carlos@exemplo.com',
    password: 'plain_secret_password_123',
    token: 'jwt.token.abc',
    role: 'Inspector'
  };

  const sanitized = sanitizeDocument('usuarios', 'usr_1', rawUser);
  assert.equal(sanitized.password, undefined, 'Senha não pode estar presente');
  assert.equal(sanitized.token, undefined, 'Token não pode estar presente');
  assert.equal(sanitized.login, undefined, 'Login pessoal deve ser excluído');
  assert.equal(sanitized.email, undefined, 'Email pessoal deve ser excluído');
  assert.equal(sanitized.loginHash, undefined, 'Nenhum hash derivado de credencial deve ser gerado');
  assert.equal(sanitized.role, 'Inspector', 'Papel técnico deve ser preservado');
});

test('2. Descoberta Dinâmica: cataloga coleções, contêineres embutidos e referências de fotos', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  const inventory = buildInventoryFromDataset(fixture, { target: 'file:synthetic-dataset.json' });

  assert.ok(inventory.summary.totalCollections >= 10, 'Deve catalogar todas as coleções presentes no dataset');
  assert.equal(inventory.summary.totalEmbeddedContainers, 1, 'Deve catalogar contêineres embutidos');
  assert.equal(inventory.summary.totalPhotoReferences, 2, 'Deve catalogar referências de fotos');
  assert.equal(inventory.collections.bookings.documents.bk_101.embeddedContainersCount, 1);
  assert.equal(inventory.collections.bookings.documents.bk_101.embeddedContainers[0].photosCount, 2);
});

test('3. Comparação de Inventários: dois inventários idênticos retornam status 100% íntegro', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  const invA = buildInventoryFromDataset(fixture, { target: 'A' });
  const invB = buildInventoryFromDataset(fixture, { target: 'B' });

  const diff = compareInventories(invA, invB);
  assert.equal(diff.identical, true, 'Devem ser idênticos');
  assert.equal(diff.collections.addedInB.length, 0);
  assert.equal(diff.collections.removedInB.length, 0);
  assert.equal(diff.collections.divergentCounts.length, 0);
  assert.equal(diff.embeddedContainers.missingInB.length, 0);
});

test('4. Comparação de Inventários: detecta remoção de contêiner ou alteração de foto', () => {
  const fixtureA = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  const fixtureB = JSON.parse(JSON.stringify(fixtureA));

  // Simula anomalia no backup B: contêiner perdeu uma foto
  fixtureB.bookings.bk_101.containers[0].photos.pop();

  const invA = buildInventoryFromDataset(fixtureA, { target: 'A' });
  const invB = buildInventoryFromDataset(fixtureB, { target: 'B' });

  const diff = compareInventories(invA, invB);
  assert.equal(diff.identical, false, 'Deve acusar divergência');
  assert.equal(diff.embeddedContainers.photoCountMismatches.length, 1);
  assert.equal(diff.embeddedContainers.photoCountMismatches[0].bookingId, 'bk_101');
  assert.equal(diff.embeddedContainers.photoCountMismatches[0].photosInA, 2);
  assert.equal(diff.embeddedContainers.photoCountMismatches[0].photosInB, 1);
});
