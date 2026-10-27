import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStorageManifests } from '../tools/storage/compare-storage-backup.mjs';

test('1. Backup 100% fiel com hash e tamanho idênticos é aprovado', () => {
  const source = [
    { path: 'containers/c_1/p1.jpg', size: 38200, hash: 'hash_abc_1', contentType: 'image/jpeg' },
    { path: 'containers/c_1/p2.jpg', size: 41000, hash: 'hash_abc_2', contentType: 'image/jpeg' }
  ];
  const backup = JSON.parse(JSON.stringify(source));

  const result = compareStorageManifests(source, backup);
  assert.equal(result.isBackupComplete, true);
  assert.equal(result.missingInBackup.length, 0);
  assert.equal(result.corruptedFiles.length, 0);
  assert.equal(result.anomalies.legacyOversized.length, 0);
});

test('2. Preservação de Fotos Antigas: foto legada com 120KB é preservada e relatada sem recompressão', () => {
  const source = [
    { path: 'containers/c_antigo/foto_pesada_legada.jpg', size: 125000, hash: 'hash_125kb', contentType: 'image/jpeg' },
    { path: 'containers/c_antigo/foto_webp_legada.webp', size: 30000, hash: 'hash_webp', contentType: 'image/webp' }
  ];
  const backup = JSON.parse(JSON.stringify(source));

  const result = compareStorageManifests(source, backup);

  assert.equal(result.isBackupComplete, true, 'Backup deve ser considerado completo se arquivos estão íntegros');
  assert.equal(result.anomalies.legacyOversized.length, 1);
  assert.equal(result.anomalies.legacyOversized[0].sizeBytes, 125000);
  assert.equal(result.anomalies.legacyOversized[0].actionTaken, 'PRESERVADO_INTEGRALMENTE_SEM_RECOMPRESSAO');

  assert.equal(result.anomalies.legacyNonJpeg.length, 1);
  assert.equal(result.anomalies.legacyNonJpeg[0].contentType, 'image/webp');
  assert.equal(result.anomalies.legacyNonJpeg[0].actionTaken, 'PRESERVADO_INTEGRALMENTE_SEM_CONVERSAO');
});

test('3. Detecção de Corrupção ou Ausência: acusa erro se arquivo faltar ou hash divergir', () => {
  const source = [
    { path: 'containers/c_1/p1.jpg', size: 38200, hash: 'hash_original', contentType: 'image/jpeg' },
    { path: 'containers/c_1/p2.jpg', size: 40000, hash: 'hash_original_2', contentType: 'image/jpeg' }
  ];
  const backup = [
    { path: 'containers/c_1/p1.jpg', size: 38200, hash: 'hash_DIVERGENTE_ALTERADO', contentType: 'image/jpeg' }
    // p2.jpg ausente no backup
  ];

  const result = compareStorageManifests(source, backup);

  assert.equal(result.isBackupComplete, false);
  assert.equal(result.missingInBackup.includes('containers/c_1/p2.jpg'), true);
  assert.equal(result.corruptedFiles.length, 1);
  assert.equal(result.corruptedFiles[0].path, 'containers/c_1/p1.jpg');
});
