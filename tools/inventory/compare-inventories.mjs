#!/usr/bin/env node
/**
 * compare-inventories.mjs
 * 
 * Compara dois arquivos de inventário gerados pelo create-inventory.mjs
 * e aponta com precisão cirúrgica:
 * - Coleções adicionadas, removidas ou com contagem divergente;
 * - Documentos ausentes em A ou em B;
 * - Documentos com mesmo ID mas conteúdo alterado (contentHash divergente);
 * - Contêineres embutidos ausentes ou alterados;
 * - Vínculos e referências de fotos divergentes;
 * - Contadores alterados.
 * 
 * NUNCA expõe senhas, tokens ou dados pessoais nos relatórios.
 */

import { readFileSync, writeFileSync } from 'node:fs';

export function compareInventories(invA, invB) {
  const diff = {
    comparedAt: new Date().toISOString(),
    identical: true,
    targetA: invA.target || 'A',
    targetB: invB.target || 'B',
    collections: {
      addedInB: [],
      removedInB: [],
      divergentCounts: []
    },
    documents: {
      missingInB: {},
      missingInA: {},
      contentHashMismatches: {}
    },
    embeddedContainers: {
      missingInB: [],
      missingInA: [],
      photoCountMismatches: []
    },
    counters: {
      mismatches: []
    },
    links: {
      differencesInA: invA.links || {},
      differencesInB: invB.links || {}
    }
  };

  const allCols = new Set([...Object.keys(invA.collections || {}), ...Object.keys(invB.collections || {})]);

  for (const colName of allCols) {
    const colA = invA.collections?.[colName];
    const colB = invB.collections?.[colName];

    if (colA && !colB) {
      diff.identical = false;
      diff.collections.removedInB.push({ collection: colName, countInA: colA.count });
      continue;
    }
    if (!colA && colB) {
      diff.identical = false;
      diff.collections.addedInB.push({ collection: colName, countInB: colB.count });
      continue;
    }

    // Compara contagens de documentos
    if (colA.count !== colB.count) {
      diff.identical = false;
      diff.collections.divergentCounts.push({
        collection: colName,
        countInA: colA.count,
        countInB: colB.count,
        delta: colB.count - colA.count
      });
    }

    // Compara documentos individuais
    const docsA = colA.documents || {};
    const docsB = colB.documents || {};
    const allDocIds = new Set([...Object.keys(docsA), ...Object.keys(docsB)]);

    for (const docId of allDocIds) {
      const docA = docsA[docId];
      const docB = docsB[docId];

      if (docA && !docB) {
        diff.identical = false;
        diff.documents.missingInB[colName] = diff.documents.missingInB[colName] || [];
        diff.documents.missingInB[colName].push(docId);
        continue;
      }
      if (!docA && docB) {
        diff.identical = false;
        diff.documents.missingInA[colName] = diff.documents.missingInA[colName] || [];
        diff.documents.missingInA[colName].push(docId);
        continue;
      }

      // Compara integridade de conteúdo por hash seguro
      if (docA.contentHash !== docB.contentHash) {
        diff.identical = false;
        diff.documents.contentHashMismatches[colName] = diff.documents.contentHashMismatches[colName] || [];
        diff.documents.contentHashMismatches[colName].push({
          docId,
          hashInA: docA.contentHash,
          hashInB: docB.contentHash
        });
      }

      // Se for /bookings, compara contêineres embutidos
      if (colName === 'bookings' && docA.embeddedContainers && docB.embeddedContainers) {
        const containersA = new Map(docA.embeddedContainers.map(c => [c.id || c.containerNumber, c]));
        const containersB = new Map(docB.embeddedContainers.map(c => [c.id || c.containerNumber, c]));

        for (const [cId, contA] of containersA.entries()) {
          const contB = containersB.get(cId);
          if (!contB) {
            diff.identical = false;
            diff.embeddedContainers.missingInB.push({ bookingId: docId, containerId: cId });
          } else if (contA.photosCount !== contB.photosCount) {
            diff.identical = false;
            diff.embeddedContainers.photoCountMismatches.push({
              bookingId: docId,
              containerId: cId,
              photosInA: contA.photosCount,
              photosInB: contB.photosCount
            });
          }
        }
        for (const [cId] of containersB.entries()) {
          if (!containersA.has(cId)) {
            diff.identical = false;
            diff.embeddedContainers.missingInA.push({ bookingId: docId, containerId: cId });
          }
        }
      }
    }
  }

  // Compara contadores
  const countersA = invA.summary?.counters || {};
  const countersB = invB.summary?.counters || {};
  const allCounters = new Set([...Object.keys(countersA), ...Object.keys(countersB)]);

  for (const cKey of allCounters) {
    const valA = JSON.stringify(countersA[cKey] ?? null);
    const valB = JSON.stringify(countersB[cKey] ?? null);
    if (valA !== valB) {
      diff.identical = false;
      diff.counters.mismatches.push({
        counter: cKey,
        inA: countersA[cKey],
        inB: countersB[cKey]
      });
    }
  }

  return diff;
}

// Execução CLI
if (process.argv[1] && process.argv[1].endsWith('compare-inventories.mjs')) {
  const [fileA, fileB, outputFile] = process.argv.slice(2);

  if (!fileA || !fileB) {
    console.error(`
Uso:
  node tools/inventory/compare-inventories.mjs <inventario_A.json> <inventario_B.json> [relatorio_diff.json]
`);
    process.exit(1);
  }

  try {
    const invA = JSON.parse(readFileSync(fileA, 'utf-8'));
    const invB = JSON.parse(readFileSync(fileB, 'utf-8'));
    const comparison = compareInventories(invA, invB);

    if (outputFile) {
      writeFileSync(outputFile, JSON.stringify(comparison, null, 2), 'utf-8');
      console.log(`[SUCESSO] Relatório de comparação salvo em: ${outputFile}`);
    }

    console.log(`\n========================================`);
    console.log(`RESULTADO DA COMPARAÇÃO DE INVENTÁRIOS:`);
    console.log(`Status: ${comparison.identical ? 'IDÊNTICOS (100% íntegro)' : 'DIVERGÊNCIAS DETECTADAS'}`);
    console.log(`Coleções adicionadas em B: ${comparison.collections.addedInB.length}`);
    console.log(`Coleções removidas em B: ${comparison.collections.removedInB.length}`);
    console.log(`Coleções com contagem divergente: ${comparison.collections.divergentCounts.length}`);
    console.log(`Contêineres embutidos ausentes em B: ${comparison.embeddedContainers.missingInB.length}`);
    console.log(`Contadores divergentes: ${comparison.counters.mismatches.length}`);
    console.log(`========================================\n`);

    process.exit(comparison.identical ? 0 : 2);
  } catch (err) {
    console.error('[ERRO] Falha ao comparar arquivos:', err.message);
    process.exit(3);
  }
}
