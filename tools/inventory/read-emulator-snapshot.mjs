/**
 * read-emulator-snapshot.mjs
 * 
 * Extrator e conversor do banco restaurado no Firestore Emulator para o formato de inventário.
 * 
 * FUNCIONAMENTO:
 * 1. O backup gerenciado do Firestore (gerado pelo gcloud firestore export ou firebase emulators:export)
 *    é carregado pelo emulador do Firestore via flag --import.
 * 2. Este script se conecta exclusivamente ao emulador local em 127.0.0.1:8080 (nunca à produção).
 * 3. Varre a REST API oficial do emulador (/v1/projects/{projectId}/databases/(default)/documents),
 *    descoberta todas as coleções e documentos, converte os tipos de dados nativos do Firestore
 *    (stringValue, integerValue, mapValue, arrayValue) para objetos JavaScript limpos.
 * 4. Alimenta diretamente o gerador de inventário (create-inventory.mjs) sem requisições à nuvem.
 */

export function parseFirestoreValue(protoValue) {
  if (!protoValue || typeof protoValue !== 'object') return null;
  if ('stringValue' in protoValue) return protoValue.stringValue;
  if ('integerValue' in protoValue) return parseInt(protoValue.integerValue, 10);
  if ('doubleValue' in protoValue) return parseFloat(protoValue.doubleValue);
  if ('booleanValue' in protoValue) return protoValue.booleanValue;
  if ('timestampValue' in protoValue) return protoValue.timestampValue;
  if ('nullValue' in protoValue) return null;
  if ('arrayValue' in protoValue) {
    const list = protoValue.arrayValue?.values || [];
    return list.map(parseFirestoreValue);
  }
  if ('mapValue' in protoValue) {
    const fields = protoValue.mapValue?.fields || {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

export function parseFirestoreDocument(docProto) {
  if (!docProto || !docProto.name) return { id: '', data: {} };
  // Formato do name: projects/{projectId}/databases/(default)/documents/{collectionId}/{docId}
  const parts = docProto.name.split('/');
  const docId = parts[parts.length - 1];
  const fields = docProto.fields || {};
  const data = { id: docId };

  for (const [k, v] of Object.entries(fields)) {
    data[k] = parseFirestoreValue(v);
  }
  return { id: docId, data };
}

/**
 * Consulta o Firestore Emulator local via REST e extrai a base completa em formato limpo.
 */
export async function extractDatasetFromEmulator({
  host = '127.0.0.1',
  port = 8080,
  projectId = 'demo-unispect-test'
} = {}) {
  const baseUrl = `http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(baseUrl);

  if (!response.ok) {
    throw new Error(`Falha ao consultar emulador em ${baseUrl}: HTTP ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const rawDocs = json.documents || [];
  const dataset = {};

  for (const doc of rawDocs) {
    const parts = doc.name.split('/');
    // projects/{proj}/databases/(default)/documents/{col}/{id}
    const colName = parts[parts.length - 2];
    const { id, data } = parseFirestoreDocument(doc);

    if (!dataset[colName]) dataset[colName] = {};
    dataset[colName][id] = data;
  }

  return dataset;
}
