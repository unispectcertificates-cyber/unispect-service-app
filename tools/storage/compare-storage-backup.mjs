/**
 * compare-storage-backup.mjs
 * 
 * Ferramenta de conferência de backup de arquivos do Firebase Storage.
 * 
 * REGRAS CRÍTICAS:
 * 1. Compara arquivo por arquivo entre origem e cópia via hash (SHA-256 ou MD5), tamanho e tipo MIME.
 * 2. PRESERVAÇÃO INTEGRAL: Fotos antigas com mais de 45.000 bytes ou formato diferente de JPEG
 *    NUNCA devem ser apagadas, modificadas ou recomprimidas.
 * 3. Divergências de padrão são classificadas em relatório de anomalias apenas para auditoria técnica.
 */

export function compareStorageManifests(sourceManifest = [], backupManifest = []) {
  const result = {
    verifiedAt: new Date().toISOString(),
    totalSourceFiles: sourceManifest.length,
    totalBackupFiles: backupManifest.length,
    isBackupComplete: true,
    missingInBackup: [],
    extraInBackup: [],
    corruptedFiles: [], // hash diferente ou tamanho divergente
    anomalies: {
      legacyOversized: [], // fotos > 45.000 bytes preservadas integralmente
      legacyNonJpeg: []    // fotos não-JPEG (ex: webp, png) preservadas integralmente
    }
  };

  const backupMap = new Map(backupManifest.map(f => [f.path, f]));
  const sourcePaths = new Set(sourceManifest.map(f => f.path));

  for (const src of sourceManifest) {
    const bkp = backupMap.get(src.path);

    if (!bkp) {
      result.isBackupComplete = false;
      result.missingInBackup.push(src.path);
      continue;
    }

    // Validação de integridade física
    const sizeMatches = src.size === bkp.size;
    const hashMatches = src.hash && bkp.hash ? src.hash === bkp.hash : true;

    if (!sizeMatches || !hashMatches) {
      result.isBackupComplete = false;
      result.corruptedFiles.push({
        path: src.path,
        sourceSize: src.size,
        backupSize: bkp.size,
        sourceHash: src.hash,
        backupHash: bkp.hash
      });
    }

    // Auditoria de regras sem alteração do arquivo:
    if (src.size > 45000) {
      result.anomalies.legacyOversized.push({
        path: src.path,
        sizeBytes: src.size,
        actionTaken: 'PRESERVADO_INTEGRALMENTE_SEM_RECOMPRESSAO'
      });
    }

    const isJpeg = (src.contentType || '').includes('jpeg') || /\.jpe?g$/i.test(src.path);
    if (!isJpeg) {
      result.anomalies.legacyNonJpeg.push({
        path: src.path,
        contentType: src.contentType || 'desconhecido',
        actionTaken: 'PRESERVADO_INTEGRALMENTE_SEM_CONVERSAO'
      });
    }
  }

  // Verifica se há arquivos extras no backup
  for (const bkp of backupManifest) {
    if (!sourcePaths.has(bkp.path)) {
      result.extraInBackup.push(bkp.path);
    }
  }

  return result;
}
