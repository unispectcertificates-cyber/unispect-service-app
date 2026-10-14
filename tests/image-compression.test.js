import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTargetDimensions,
  compressCanvasAdaptively,
  compressImage,
  MAX_PHOTO_BYTES,
  MAX_DIMENSIONS,
  COMPRESSION_VERSION
} from '../src/utils/imageCompression.js';

test('1. calculateTargetDimensions - Fotos horizontais (landscape) cabem em 1024 x 768', () => {
  // Proporção 4:3
  const dim1 = calculateTargetDimensions(4032, 3024);
  assert.equal(dim1.isLandscape, true);
  assert.equal(dim1.width, 1024);
  assert.equal(dim1.height, 768);
  assert.ok(dim1.width <= 1024);
  assert.ok(dim1.height <= 768);

  // Proporção 16:9
  const dim2 = calculateTargetDimensions(1920, 1080);
  assert.equal(dim2.isLandscape, true);
  assert.equal(dim2.width, 1024);
  assert.equal(dim2.height, 576);
  assert.ok(dim2.width <= 1024);
  assert.ok(dim2.height <= 768);
});

test('2. calculateTargetDimensions - Fotos verticais (portrait) cabem em 768 x 1024', () => {
  // Proporção 3:4
  const dim1 = calculateTargetDimensions(3024, 4032);
  assert.equal(dim1.isLandscape, false);
  assert.equal(dim1.width, 768);
  assert.equal(dim1.height, 1024);
  assert.ok(dim1.width <= 768);
  assert.ok(dim1.height <= 1024);

  // Proporção 9:16
  const dim2 = calculateTargetDimensions(1080, 1920);
  assert.equal(dim2.isLandscape, false);
  assert.equal(dim2.width, 576);
  assert.equal(dim2.height, 1024);
  assert.ok(dim2.width <= 768);
  assert.ok(dim2.height <= 1024);
});

test('3. calculateTargetDimensions - Imagens menores NUNCA são ampliadas (scale <= 1)', () => {
  // Menor horizontal
  const dimSmallLand = calculateTargetDimensions(640, 480);
  assert.equal(dimSmallLand.width, 640);
  assert.equal(dimSmallLand.height, 480);
  assert.equal(dimSmallLand.scale, 1);

  // Menor vertical
  const dimSmallPort = calculateTargetDimensions(480, 640);
  assert.equal(dimSmallPort.width, 480);
  assert.equal(dimSmallPort.height, 640);
  assert.equal(dimSmallPort.scale, 1);

  // Quadrada
  const dimSquare = calculateTargetDimensions(2000, 2000);
  assert.equal(dimSquare.width, 768);
  assert.equal(dimSquare.height, 768);
});

test('4. compressCanvasAdaptively - Encontra maior qualidade adaptativa que caiba em 45.000 bytes', async () => {
  // Mock de canvas que gera tamanho proporcional à qualidade solicitada
  const mockCanvas = {
    toBlob: (cb, type, quality) => {
      // Simula: q = 0.90 -> 90.000 bytes, q = 0.40 -> 40.000 bytes
      const simulatedSize = Math.round(quality * 100000);
      const blob = new Blob([new Uint8Array(simulatedSize)], { type: 'image/jpeg' });
      cb(blob);
    }
  };

  const result = await compressCanvasAdaptively(mockCanvas, { maxBytes: 45000 });
  assert.equal(result.withinLimit, true);
  assert.ok(result.sizeBytes <= 45000, `Tamanho ${result.sizeBytes} deve ser <= 45000`);
  assert.ok(result.quality >= 0.40 && result.quality <= 0.45, `Qualidade calculada deve ser próxima de 0.44 (foi ${result.quality})`);
  assert.ok(result.attempts >= 2 && result.attempts <= 7);
});

test('5. compressCanvasAdaptively - Caso imagem ultrapasse 45KB no piso de qualidade (0.20), não reduz resolução nem descarta', async () => {
  // Simula imagem com ruído extremo que mesmo no piso 0.20 resulta em 52.000 bytes
  const mockHeavyCanvas = {
    toBlob: (cb, type, quality) => {
      const simulatedSize = Math.round(50000 + quality * 30000); // no mínimo 56.000 bytes
      const blob = new Blob([new Uint8Array(simulatedSize)], { type: 'image/jpeg' });
      cb(blob);
    }
  };

  const result = await compressCanvasAdaptively(mockHeavyCanvas, { maxBytes: 45000 });
  assert.equal(result.withinLimit, false);
  assert.equal(result.targetLimitExceeded, true);
  assert.ok(result.sizeBytes > 45000);
  assert.equal(result.quality, 0.20);
  assert.ok(result.blob instanceof Blob);
});

test('6. compressCanvasAdaptively - Imagem simples que cabe diretamente em 0.90 encerra na 1ª tentativa', async () => {
  const mockLightCanvas = {
    toBlob: (cb, type, quality) => {
      // Mesmo em 0.90 o tamanho é 25.000 bytes
      const simulatedSize = Math.round(quality * 25000);
      const blob = new Blob([new Uint8Array(simulatedSize)], { type: 'image/jpeg' });
      cb(blob);
    }
  };

  const result = await compressCanvasAdaptively(mockLightCanvas, { maxBytes: 45000 });
  assert.equal(result.withinLimit, true);
  assert.equal(result.quality, 0.90);
  assert.ok(result.sizeBytes <= 45000);
  assert.equal(result.attempts, 1);
});

test('7. compressImage - Tratamento de falha garante fallback e nunca perde a captura original', async () => {
  const originalBlob = new Blob(['dummy content'], { type: 'image/jpeg' });
  // Passa entrada inválida ou ambiente sem canvas nativo completo
  const res = await compressImage(originalBlob);

  assert.ok(res.blob);
  assert.ok(res.compressionVersion.includes('fallback') || res.compressionVersion === COMPRESSION_VERSION);
  // O blob retornado não é nulo e preserva o conteúdo
  assert.equal(res.sizeBytes, originalBlob.size);
});
