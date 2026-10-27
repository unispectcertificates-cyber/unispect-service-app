#!/usr/bin/env node
/**
 * create-inventory.mjs
 * 
 * Ferramenta somente-leitura para geração de inventário estruturado de dados.
 * 
 * REGRAS DE SEGURANÇA:
 * 1. O destino NUNCA é a produção por padrão. Exige argumento explícito --target (ex: --target=emulator ou --target=file:<caminho>).
 * 2. Se nenhum target for informado, o comando falha imediatamente instruindo o operador.
 * 3. Se tentar apontar para produção sem chave explícita de homologação, aborta.
 * 4. NENHUMA senha, token ou dado sensível pessoal é gravado no inventário.
 * 5. Não se limita a 16 coleções: descobre dinamicamente todas as coleções e subcoleções.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function sha256(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data ?? '')).digest('hex');
}

export function sanitizeDocument(colName, docId, data) {
  if (!data || typeof data !== 'object') return {};
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    // 1. Exclui categoricamente senhas, credenciais, tokens e segredos (NUNCA gera hash deles)
    if (/password|senha|token|secret|credential|auth|hash/i.test(key)) {
      continue;
    }

    // 2. Para a coleção /usuarios, preserva estritamente identificadores de papel e controle de acesso
    // Exclui dados sensíveis pessoais como login direto, email e nomes
    if (colName === 'usuarios' && /login|username|email|name|nome/i.test(key)) {
      continue;
    }

    // 3. Preserva identificadores técnicos, status, datas, contadores e números de série
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * Analisa e cataloga uma estrutura de documentos de banco (em memória, arquivo ou cliente)
 * descobrindo coleções, subcoleções, contêineres embutidos, fotos e vínculos.
 */
export function buildInventoryFromDataset(dataset, metadata = {}) {
  const inventory = {
    generatedAt: new Date().toISOString(),
    target: metadata.target || 'unknown',
    collections: {},
    summary: {
      totalCollections: 0,
      totalRootDocuments: 0,
      totalSubcollections: 0,
      totalSubcollectionDocuments: 0,
      totalEmbeddedContainers: 0,
      totalPhotoReferences: 0,
      totalStoragePaths: 0,
      counters: {}
    },
    links: {
      bookingsWithoutExporter: [],
      bookingsWithoutLocation: [],
      containersWithoutPhotos: [],
      orphanFieldContainers: []
    }
  };

  const knownExporters = new Set();
  const knownLocations = new Set();

  // 1. Descoberta dinâmica de todas as coleções raiz
  for (const [colName, docsMap] of Object.entries(dataset)) {
    if (!docsMap || typeof docsMap !== 'object') continue;

    inventory.collections[colName] = {
      count: 0,
      documents: {},
      subcollections: {}
    };

    for (const [docId, rawDoc] of Object.entries(docsMap)) {
      inventory.collections[colName].count++;
      inventory.summary.totalRootDocuments++;

      // Separa subcoleções embutidas caso existam (ex: doc._subcollections)
      const { _subcollections, ...docFields } = rawDoc || {};

      // Sanitiza dados excluindo senhas e dados confidenciais
      const sanitized = sanitizeDocument(colName, docId, docFields);
      const contentHash = sha256(sanitized);

      const docEntry = {
        id: docId,
        contentHash,
        clientId: docFields.clientId || null,
        status: docFields.status || null
      };

      // Catálogo especial para /exportadores e /locais
      if (colName === 'exportadores') knownExporters.add(docId);
      if (colName === 'locais') knownLocations.add(docId);

      // Catálogo de contadores
      if (colName === 'bookingCounters') {
        inventory.summary.counters[docId] = docFields;
      }

      // Catálogo detalhado de /bookings (contêineres embutidos e fotos)
      if (colName === 'bookings' && Array.isArray(docFields.containers)) {
        docEntry.embeddedContainersCount = docFields.containers.length;
        docEntry.embeddedContainers = [];

        // Validação de vínculos
        if (!docFields.exporterId || !knownExporters.has(docFields.exporterId)) {
          inventory.links.bookingsWithoutExporter.push(docId);
        }
        if (!docFields.locationId || !knownLocations.has(docFields.locationId)) {
          inventory.links.bookingsWithoutLocation.push(docId);
        }

        for (const c of docFields.containers) {
          inventory.summary.totalEmbeddedContainers++;
          const cId = c.id || c.containerNumber;
          const photos = Array.isArray(c.photos) ? c.photos : [];
          inventory.summary.totalPhotoReferences += photos.length;

          if (photos.length === 0) {
            inventory.links.containersWithoutPhotos.push({ bookingId: docId, containerId: cId });
          }

          const photoPaths = photos.map(p => {
            inventory.summary.totalStoragePaths++;
            return {
              id: p.id,
              storagePath: p.storagePath || `containers/${cId}/${p.id}.jpg`,
              hasUrl: Boolean(p.url)
            };
          });

          docEntry.embeddedContainers.push({
            id: cId,
            containerNumber: c.containerNumber,
            tara: c.tara || null,
            definiteSeal: typeof c.definiteSeal === 'object' ? c.definiteSeal?.sealNumber : c.definiteSeal,
            photosCount: photos.length,
            photos: photoPaths
          });
        }
      }

      inventory.collections[colName].documents[docId] = docEntry;

      // 2. Descoberta de subcoleções dinâmicas
      if (_subcollections && typeof _subcollections === 'object') {
        for (const [subName, subDocs] of Object.entries(_subcollections)) {
          if (!inventory.collections[colName].subcollections[subName]) {
            inventory.collections[colName].subcollections[subName] = { count: 0, documents: {} };
            inventory.summary.totalSubcollections++;
          }
          for (const [subDocId, subDocData] of Object.entries(subDocs || {})) {
            inventory.collections[colName].subcollections[subName].count++;
            inventory.summary.totalSubcollectionDocuments++;
            inventory.collections[colName].subcollections[subName].documents[subDocId] = {
              id: subDocId,
              parentDocId: docId,
              contentHash: sha256(sanitizeDocument(subName, subDocId, subDocData))
            };
          }
        }
      }
    }
  }

  inventory.summary.totalCollections = Object.keys(inventory.collections).length;
  return inventory;
}

// Execução CLI
if (process.argv[1] && process.argv[1].endsWith('create-inventory.mjs')) {
  const args = process.argv.slice(2);
  const targetArg = args.find(a => a.startsWith('--target='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const outputFile = outputArg ? outputArg.split('=')[1] : 'inventory-output.json';

  if (!targetArg) {
    console.error(`
[BLOQUEIO DE SEGURANÇA] Destino não especificado!
A ferramenta de inventário exige um destino explícito para impedir execuções acidentais na produção.

Uso:
  node tools/inventory/create-inventory.mjs --target=file:<caminho_dados.json> [--output=relatorio.json]
  node tools/inventory/create-inventory.mjs --target=emulator [--output=relatorio.json]

Exemplos seguros:
  node tools/inventory/create-inventory.mjs --target=file:tests/fixtures/synthetic-dataset.json
`);
    process.exit(1);
  }

  const targetValue = targetArg.split('=')[1];
  if (targetValue.includes('production') || targetValue === 'prod') {
    console.error('[BLOQUEIO FATAL] Execuções automáticas contra a base de produção não são permitidas nesta etapa.');
    process.exit(2);
  }

  if (targetValue.startsWith('file:')) {
    const filePath = targetValue.replace('file:', '');
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      const inventory = buildInventoryFromDataset(raw, { target: targetValue });
      writeFileSync(outputFile, JSON.stringify(inventory, null, 2), 'utf-8');
      console.log(`[SUCESSO] Inventário gerado com sucesso em: ${outputFile}`);
      console.log(`Total de Coleções descobertas: ${inventory.summary.totalCollections}`);
      console.log(`Total de Documentos Raiz: ${inventory.summary.totalRootDocuments}`);
      console.log(`Total de Contêineres Embutidos: ${inventory.summary.totalEmbeddedContainers}`);
      console.log(`Total de Referências de Fotos: ${inventory.summary.totalPhotoReferences}`);
    } catch (err) {
      console.error(`[ERRO] Falha ao processar arquivo ${filePath}:`, err.message);
      process.exit(3);
    }
  } else {
    console.error(`[PENDÊNCIA] O target '${targetValue}' requer conexão de rede ou ferramenta externa.`);
    process.exit(4);
  }
}
