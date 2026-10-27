import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePhotoOwnership, authorizeStorageAccess } from '../tools/storage/storage-ownership.mjs';

test('1. Comprovação de Propriedade: foto legada sem clientId no path é resolvida via containerPhotos', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  // Adiciona clientId no metadado
  dataset.containerPhotos.photo_01.clientId = 'client_interport';

  const ownership = resolvePhotoOwnership({
    storagePath: 'containers/c_1/photo_01.jpg',
    containerPhotosMap: dataset.containerPhotos,
    bookingsMap: dataset.bookings
  });

  assert.equal(ownership.validPath, true);
  assert.equal(ownership.ownerClientId, 'client_interport');
  assert.equal(ownership.provenVia, 'containerPhotos');
  assert.equal(ownership.orphan, false);
});

test('2. Comprovação de Propriedade: foto sem metadado direto é comprovada pelo Booking contêiner pai', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  // Remove metadado direto para forçar busca por grafo no Booking
  delete dataset.containerPhotos.photo_01;

  const ownership = resolvePhotoOwnership({
    storagePath: 'containers/c_1/photo_01.jpg',
    containerPhotosMap: dataset.containerPhotos,
    bookingsMap: dataset.bookings
  });

  assert.equal(ownership.validPath, true);
  assert.equal(ownership.ownerClientId, 'client_interport');
  assert.equal(ownership.provenVia, 'booking_container');
  assert.equal(ownership.bookingId, 'bk_101');
});

test('3. Autorização de Acesso ao Storage: bloqueia usuário de outro cliente', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  dataset.containerPhotos.photo_01.clientId = 'client_interport';

  const userOutroCliente = {
    uid: 'usr_terminal_b',
    token: { role: 'CLIENT_ADMIN', authorizedClients: ['client_terminal_b'] }
  };

  const authResult = authorizeStorageAccess({
    storagePath: 'containers/c_1/photo_01.jpg',
    userAuth: userOutroCliente,
    dataset
  });

  assert.equal(authResult.allowed, false);
  assert.equal(authResult.reason, 'forbidden_cross_tenant');
  assert.equal(authResult.ownerClientId, 'client_interport');
});

test('4. Autorização de Acesso ao Storage: autoriza usuário com client_interport', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  dataset.containerPhotos.photo_01.clientId = 'client_interport';

  const userInterport = {
    uid: 'usr_interport_1',
    token: { role: 'CLIENT_ADMIN', authorizedClients: ['client_interport'] }
  };

  const authResult = authorizeStorageAccess({
    storagePath: 'containers/c_1/photo_01.jpg',
    userAuth: userInterport,
    dataset
  });

  assert.equal(authResult.allowed, true);
  assert.equal(authResult.ownerClientId, 'client_interport');
});

test('5. Detecção de Foto Órfã: arquivo físico sem qualquer vínculo em banco é bloqueado', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));

  const authResult = authorizeStorageAccess({
    storagePath: 'containers/cont_desconhecido/foto_fantasma.jpg',
    userAuth: { uid: 'usr_1', token: { authorizedClients: ['client_interport'] } },
    dataset
  });

  assert.equal(authResult.allowed, false);
  assert.equal(authResult.reason, 'orphan_file');
});
