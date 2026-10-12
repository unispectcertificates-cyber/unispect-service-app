import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeContainerForFilename,
  formatDateForFilename,
  buildPhotoFilename,
  dataUrlToBlob,
  resolvePhotoBlob
} from '../src/utils/photoDownload.js';

test('1. Sanitização do número do container para nome de arquivo', () => {
  assert.equal(sanitizeContainerForFilename('MSBU 528997-0'), 'MSBU5289970');
  assert.equal(sanitizeContainerForFilename('msbu-1234567'), 'MSBU1234567');
  assert.equal(sanitizeContainerForFilename(''), 'CONTAINER');
  assert.equal(sanitizeContainerForFilename(null), 'CONTAINER');
});

test('2. Formatação da data para o nome do arquivo', () => {
  assert.equal(formatDateForFilename('2026-10-12'), '2026-10-12');
  assert.equal(formatDateForFilename(new Date(2026, 9, 12, 14, 30)), '2026-10-12');
});

test('3. Geração do nome do arquivo padrão: MSBU5289970_2026-10-12_001.jpg', () => {
  const filename1 = buildPhotoFilename({
    containerNumber: 'MSBU 528997-0',
    index: 0,
    date: '2026-10-12',
    mimeType: 'image/jpeg'
  });
  assert.equal(filename1, 'MSBU5289970_2026-10-12_001.jpg');

  const filename2 = buildPhotoFilename({
    containerNumber: 'CXRU9876543',
    index: 14,
    date: '2026-10-12',
    mimeType: 'image/png'
  });
  assert.equal(filename2, 'CXRU9876543_2026-10-12_015.png');
});

test('4. Conversão de DataURL Base64 para Blob sem dependência de rede', () => {
  // 1x1 transparent PNG em Base64
  const transparentPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const blob = dataUrlToBlob(transparentPng);

  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'image/png');
  assert.ok(blob.size > 0);
});

test('5. Resolução de Blob local direto sem requisição de rede', async () => {
  const transparentPng = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const photo = {
    id: 'photo_local_1',
    dataUrl: transparentPng,
    name: 'foto_teste.jpg'
  };

  const resolved = await resolvePhotoBlob(photo);
  assert.ok(resolved instanceof Blob);
  assert.equal(resolved.type, 'image/jpeg');
});

test('6. Erro amigável ao tentar baixar foto remota quando offline', async () => {
  const photo = {
    id: 'photo_remote_1',
    url: 'https://example.com/fake-storage-photo.jpg'
  };

  // Simula ambiente offline
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });

  await assert.rejects(
    async () => {
      await resolvePhotoBlob(photo);
    },
    {
      message: /sem conexão com a internet/i
    }
  );
});

test('7. O download não altera nem remove propriedades da foto original (imutabilidade)', async () => {
  const transparentPng = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const original = {
    id: 'p_100',
    dataUrl: transparentPng,
    name: 'foto.jpg',
    containerNumber: 'MSBU5289970',
    createdAt: '2026-10-12T10:00:00Z'
  };
  const snapshotBefore = JSON.stringify(original);

  const filename = buildPhotoFilename({
    photo: original,
    containerNumber: original.containerNumber,
    index: 0,
    date: original.createdAt
  });
  const blob = await resolvePhotoBlob(original);

  assert.equal(filename, 'MSBU5289970_2026-10-12_001.jpg');
  assert.ok(blob instanceof Blob);
  assert.equal(JSON.stringify(original), snapshotBefore, 'O objeto original não deve ser alterado durante o download');
});

test('8. Preservação de formatos e extensões modernas (WebP)', () => {
  const filename = buildPhotoFilename({
    containerNumber: 'ABCD1234567',
    index: 2,
    date: '2026-10-12',
    mimeType: 'image/webp'
  });
  assert.equal(filename, 'ABCD1234567_2026-10-12_003.webp');
});

