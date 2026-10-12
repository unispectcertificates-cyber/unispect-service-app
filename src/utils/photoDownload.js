/**
 * photoDownload.js
 * Utilitários para download individual e compartilhamento de fotos no UNISPECT.
 * Entrega a imagem original na melhor qualidade disponível, sem marca d'água ou sobreposições.
 * Nome no padrão: MSBU5289970_2026-10-12_001.jpg
 */

import { fieldQueue } from './fieldQueue.js';

// Sanitiza número de container para nome de arquivo (apenas caracteres alfanuméricos)
export function sanitizeContainerForFilename(containerNumber) {
  if (!containerNumber) return 'CONTAINER';
  const clean = String(containerNumber).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean || 'CONTAINER';
}

// Formata data para YYYY-MM-DD
export function formatDateForFilename(dateInput) {
  if (!dateInput) {
    return new Date().toISOString().split('T')[0];
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Determina extensão apropriada baseada no MIME type ou nome/URL
export function getExtensionFromMime(mimeType = '', fallbackUrl = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('heic')) return 'heic';

  const str = String(fallbackUrl || '').toLowerCase();
  if (str.includes('.png')) return 'png';
  if (str.includes('.webp')) return 'webp';
  if (str.includes('.jpeg') || str.includes('.jpg')) return 'jpg';

  return 'jpg';
}

// Gera o nome do arquivo seguindo rigorosamente a convenção solicitada
export function buildPhotoFilename({ containerNumber, index = 0, date = null, mimeType = '', photo = null }) {
  const cleanNum = sanitizeContainerForFilename(containerNumber || photo?.containerNumber || photo?.number);
  const photoDate = date || photo?.createdAt || photo?.date || new Date();
  const cleanDate = formatDateForFilename(photoDate);
  const seq = String(Number(index || 0) + 1).padStart(3, '0');
  const ext = getExtensionFromMime(mimeType, photo?.url || photo?.name);

  return `${cleanNum}_${cleanDate}_${seq}.${ext}`;
}

// Converte Data URL Base64 para Blob sem dependência de rede
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('DataURL inválida para conversão em Blob.');
  }
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binStr = atob(parts[1]);
  const len = binStr.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Resolve o Blob da foto na melhor qualidade disponível:
 * 1. Objeto Blob direto (se já disponível em memória ou campo blob)
 * 2. Data URL Base64 (converte localmente)
 * 3. IndexedDB local (fieldQueue.getPhoto) para fotos de campo offline
 * 4. Fetch na URL do Storage com verificação de conectividade
 */
export async function resolvePhotoBlob(photoInput) {
  if (!photoInput) {
    throw new Error('Nenhuma foto foi fornecida para download.');
  }

  // 1. Já é um Blob ou File
  if (typeof Blob !== 'undefined' && photoInput instanceof Blob) {
    return photoInput;
  }
  if (photoInput.blob && typeof Blob !== 'undefined' && photoInput.blob instanceof Blob) {
    return photoInput.blob;
  }

  // 2. DataURL Base64
  const dataUrl = photoInput.dataUrl || (typeof photoInput === 'string' && photoInput.startsWith('data:') ? photoInput : null);
  if (dataUrl) {
    return dataUrlToBlob(dataUrl);
  }

  // 3. Busca no armazenamento local offline (IndexedDB via fieldQueue)
  if (photoInput.id && typeof window !== 'undefined' && fieldQueue?.getPhoto) {
    try {
      const localRec = await fieldQueue.getPhoto(photoInput.id);
      if (localRec?.blob instanceof Blob) {
        return localRec.blob;
      }
      if (localRec?.dataUrl) {
        return dataUrlToBlob(localRec.dataUrl);
      }
    } catch (e) {
      // Continua para tentativa de URL
    }
  }

  // 4. URL remota (Firebase Storage ou blob URL)
  const targetUrl = photoInput.url || (typeof photoInput === 'string' && !photoInput.startsWith('data:') ? photoInput : null);
  if (targetUrl) {
    // Verifica se estamos no browser e se há conectividade
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;

    try {
      const response = await fetch(targetUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Falha no servidor ao carregar imagem (${response.status})`);
      }
      return await response.blob();
    } catch (err) {
      if (!isOnline) {
        throw new Error('Você está sem conexão com a internet e esta foto ainda não foi baixada localmente neste aparelho.');
      }
      // Se deu erro de CORS ou rede, repassa com mensagem clara
      throw new Error('Não foi possível obter a imagem da foto. Verifique a conexão com a internet e tente novamente.');
    }
  }

  throw new Error('Formato de foto não suportado ou arquivo não encontrado.');
}

/**
 * Dispara o download da foto no Desktop ou Navegador Mobile
 */
export async function downloadPhotoFile({ photo, containerNumber = '', index = 0, date = null }) {
  const blob = await resolvePhotoBlob(photo);
  const filename = buildPhotoFilename({
    containerNumber,
    index,
    date,
    mimeType: blob.type,
    photo
  });

  if (typeof window === 'undefined' || !window.document) {
    return { success: true, filename, blob };
  }

  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  }

  return { success: true, filename, blob };
}

/**
 * Verifica se a API de compartilhamento nativo suporta compartilhamento de arquivos
 */
export function canSharePhotoFile() {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  if (!navigator.canShare) return false;
  try {
    const testFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    return navigator.canShare({ files: [testFile] });
  } catch (e) {
    return false;
  }
}

/**
 * Compartilha o arquivo de foto no celular/tablet via mecanismo nativo (WhatsApp, Salvar na Galeria, etc.)
 * Caso o dispositivo não suporte compartilhamento de arquivos, realiza o download padrão.
 */
export async function shareOrDownloadPhotoFile({ photo, containerNumber = '', index = 0, date = null }) {
  const blob = await resolvePhotoBlob(photo);
  const filename = buildPhotoFilename({
    containerNumber,
    index,
    date,
    mimeType: blob.type,
    photo
  });

  const canShare = canSharePhotoFile();

  if (canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      await navigator.share({
        files: [file],
        title: filename,
        text: `Foto do container ${sanitizeContainerForFilename(containerNumber)}`
      });
      return { success: true, action: 'shared', filename };
    } catch (err) {
      // Se o usuário apenas cancelou o diálogo de compartilhamento
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.warn('Erro ao compartilhar foto nativamente, executando download como fallback:', err);
    }
  }

  // Fallback: download direto no aparelho
  return downloadPhotoFile({ photo, containerNumber, index, date });
}
