/**
 * Utilitários de padronização, geração de Código de Cadastro, formatação de CNPJ/Data
 * e resolução de exibição (nome vs. código) para Exportadores.
 */

/**
 * Formata string de CNPJ no padrão 00.000.000/0000-00
 */
export function formatExporterCnpj(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Infere a data de cadastro (YYYY-MM-DD) de um exportador existente
 */
export function inferExporterRegistrationDate(exp) {
  if (!exp) return new Date().toISOString().split('T')[0];
  if (exp.registrationDate && /^\d{4}-\d{2}-\d{2}/.test(String(exp.registrationDate))) {
    return String(exp.registrationDate).slice(0, 10);
  }
  if (exp.createdAt) {
    const dt = new Date(exp.createdAt);
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  const idStr = String(exp.id || '');
  const tsMatch = idStr.match(/^exp_(\d{13})/);
  if (tsMatch) {
    const dt = new Date(Number(tsMatch[1]));
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  if (idStr === '1' || idStr === '2' || idStr === '3') {
    return '2026-01-10';
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Formata YYYY-MM-DD para DD/MM/AAAA
 */
export function formatExporterDateBr(dateStr) {
  if (!dateStr) return '-';
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) {
    return dt.toLocaleDateString('pt-BR');
  }
  return String(dateStr);
}

/**
 * Gera o próximo Código de Cadastro sequencial (ex: EXP-0001, EXP-0002...)
 */
export function generateNextExporterCode(exportadores = []) {
  let maxNum = 0;
  for (const exp of exportadores || []) {
    const codeStr = String(exp?.code || '').trim();
    const m = codeStr.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  if (maxNum < (exportadores || []).length) {
    maxNum = (exportadores || []).length;
  }
  return `EXP-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Normaliza a lista de exportadores garantindo que cada um possua `code`, `registrationDate`, `cnpj` e `omitNameInDocuments`.
 */
export function normalizeExportadoresWithCodes(rawList = []) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  // Ordenação determinística para atribuição estável de códigos aos registros antigos sem código salvo
  const sortedForAssignment = [...rawList].sort((a, b) => {
    const aId = String(a?.id || '');
    const bId = String(b?.id || '');
    const aIsDefault = /^\d+$/.test(aId);
    const bIsDefault = /^\d+$/.test(bId);
    if (aIsDefault && bIsDefault) return Number(aId) - Number(bId);
    if (aIsDefault) return -1;
    if (bIsDefault) return 1;

    const aTs = aId.match(/^exp_(\d{13})/) ? Number(aId.match(/^exp_(\d{13})/)[1]) : (a?.createdAt || 0);
    const bTs = bId.match(/^exp_(\d{13})/) ? Number(bId.match(/^exp_(\d{13})/)[1]) : (b?.createdAt || 0);
    if (aTs !== bTs) return aTs - bTs;

    return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
  });

  const usedCodes = new Set();
  for (const exp of sortedForAssignment) {
    if (exp?.code && String(exp.code).trim()) {
      usedCodes.add(String(exp.code).trim().toUpperCase());
    }
  }

  const codeById = new Map();
  let seqCounter = 1;

  for (const exp of sortedForAssignment) {
    if (exp?.code && String(exp.code).trim()) {
      codeById.set(exp.id, String(exp.code).trim().toUpperCase());
    } else {
      let candidate = `EXP-${String(seqCounter).padStart(4, '0')}`;
      while (usedCodes.has(candidate)) {
        seqCounter++;
        candidate = `EXP-${String(seqCounter).padStart(4, '0')}`;
      }
      usedCodes.add(candidate);
      codeById.set(exp.id, candidate);
      seqCounter++;
    }
  }

  return sortedForAssignment.map(exp => ({
    ...exp,
    code: codeById.get(exp.id) || exp.code || 'EXP-0001',
    registrationDate: inferExporterRegistrationDate(exp),
    cnpj: formatExporterCnpj(exp.cnpj || ''),
    omitNameInDocuments: Boolean(exp.omitNameInDocuments)
  }));
}

/**
 * Retorna a identificação do exportador para exibição em documentos/certificados/relatórios:
 * Se `forceCodeOnly` estiver ativo OU `exp.omitNameInDocuments` for true, retorna apenas o Código de Cadastro.
 */
export function getExporterDocumentLabel(exporter, { forceCodeOnly = false } = {}) {
  if (!exporter) return 'N/A';
  const code = String(exporter.code || '').trim();
  if ((forceCodeOnly || exporter.omitNameInDocuments) && code) {
    return code;
  }
  return exporter.name || code || 'N/A';
}
