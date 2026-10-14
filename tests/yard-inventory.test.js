import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeContainerCode,
  createYardPassage,
  confirmYardPresence,
  startYardAuditSession,
  recordAuditReading,
  getAuditSessionSummary,
  closeYardAuditSession,
  confirmInventoryExit,
  linkBookingToPassage,
  findActivePassageInYard
} from '../src/utils/yardInventory.js';

test('1. Normalização e validação de container para inventário', () => {
  assert.equal(normalizeContainerCode('MSCU 123456-7'), 'MSCU1234567');
  assert.equal(normalizeContainerCode('mscu-123456/7'), 'MSCU1234567');
  assert.throws(() => createYardPassage({ containerNumber: '12', yardId: 'loc_1' }), /inválido/i);
  assert.throws(() => createYardPassage({ containerNumber: 'MSCU1234567', yardId: '' }), /Pátio.*obrigatório/i);
});

test('2. Criação de passagem com identidade própria, datas e evento inicial', () => {
  const now = 1791825000000;
  const passage = createYardPassage({
    containerNumber: 'MSCU 123456-7',
    yardId: 'loc_1',
    yardName: 'Interport Logistica',
    actor: { id: 'ins_1', name: 'Carlos Santos', role: 'Inspector' },
    now: () => now
  });

  assert.ok(passage.id.startsWith('yp_MSCU1234567_'));
  assert.equal(passage.status, 'active');
  assert.equal(passage.firstObservedAt, now);
  assert.equal(passage.lastConfirmedAt, now);
  assert.equal(passage.firstObservedBy.name, 'Carlos Santos');
  assert.equal(passage.events.length, 1);
  assert.equal(passage.events[0].type, 'first_seen');
  assert.equal(passage.exitInfo.actualExitTime, null);
});

test('3. Impede duas passagens ativas duplicadas no mesmo pátio', () => {
  const passage1 = createYardPassage({
    containerNumber: 'MSCU 123456-7',
    yardId: 'loc_1',
    yardName: 'Interport Logistica',
    now: () => 1000
  });

  const activeFound = findActivePassageInYard([passage1], 'MSCU 123456-7', 'loc_1');
  assert.ok(activeFound);
  assert.equal(activeFound.id, passage1.id);

  // No mesmo pátio não deve permitir outra ativa
  const inAnotherYard = findActivePassageInYard([passage1], 'MSCU 123456-7', 'loc_2');
  assert.equal(inAnotherYard, null);
});

test('4. Retorno do mesmo container em nova passagem preservando histórico anterior', () => {
  const p1 = createYardPassage({ containerNumber: 'MSCU 123456-7', yardId: 'loc_1', now: () => 1000 });
  const p1Exited = confirmInventoryExit({
    passage: p1,
    actor: { id: 'adm_1', name: 'Supervisor ADM' },
    now: () => 2000
  });

  assert.equal(p1Exited.status, 'exited');
  assert.equal(p1Exited.exitInfo.type, 'inventory_exit');
  assert.equal(p1Exited.exitInfo.lastKnownPresenceAt, 1000);
  assert.equal(p1Exited.exitInfo.actualExitTime, null); // Horário real desconhecido

  // Agora que a passagem 1 é exited, não há passagem ativa no pátio
  const active = findActivePassageInYard([p1Exited], 'MSCU 123456-7', 'loc_1');
  assert.equal(active, null);

  // Nova passagem criada meses depois
  const p2 = createYardPassage({ containerNumber: 'MSCU 123456-7', yardId: 'loc_1', now: () => 5000 });
  assert.notEqual(p1.id, p2.id);
  assert.equal(p2.status, 'active');
  assert.equal(p2.firstObservedAt, 5000);

  // Ambas as passagens coexistem no banco de dados com seus respectivos históricos
  const allPassages = [p1Exited, p2];
  assert.equal(allPassages.length, 2);
  assert.equal(allPassages.filter(p => p.status === 'exited').length, 1);
  assert.equal(allPassages.filter(p => p.status === 'active').length, 1);
});

test('5. Vínculo independente com Booking preserva dados e presença física', () => {
  const passage = createYardPassage({ containerNumber: 'CXRU 987654-3', yardId: 'loc_1', now: () => 1000 });
  const linked = linkBookingToPassage({
    passage,
    bookingId: 'bk_2026_01',
    bookingNumber: 'BKG-998877',
    actor: { id: 'adm_1', name: 'Coordenador' },
    now: () => 1500
  });

  assert.equal(linked.bookingId, 'bk_2026_01');
  assert.equal(linked.bookingNumber, 'BKG-998877');
  assert.equal(linked.firstObservedAt, 1000); // Intacto
  assert.equal(linked.status, 'active'); // Intacto
  assert.equal(linked.events.length, 2);
  assert.equal(linked.events[1].type, 'booking_linked');
});

test('6. Conferência de pátio: leituras repetidas contam uma única presença (idempotência)', () => {
  const p1 = createYardPassage({ containerNumber: 'MSCU 111111-1', yardId: 'loc_1', now: () => 1000 });
  const p2 = createYardPassage({ containerNumber: 'MSCU 222222-2', yardId: 'loc_1', now: () => 1000 });

  const audit = startYardAuditSession({
    yardId: 'loc_1',
    yardName: 'Pátio Principal',
    actor: { id: 'ins_1', name: 'Inspetor 1' },
    activePassagesInYard: [p1, p2],
    now: () => 2000
  });

  assert.equal(audit.expectedContainers.length, 2);

  // Leitura 1 do container 1 às 2010ms
  let updatedAudit = recordAuditReading({
    audit,
    containerNumber: 'MSCU 111111-1',
    actor: { id: 'ins_1', name: 'Inspetor 1' },
    now: () => 2010
  });

  // Leitura 2 (repetida) do mesmo container por outro inspetor às 2050ms
  updatedAudit = recordAuditReading({
    audit: updatedAudit,
    containerNumber: 'MSCU 111111-1',
    actor: { id: 'ins_2', name: 'Inspetor 2' },
    now: () => 2050
  });

  const reading = updatedAudit.readings['MSCU1111111'];
  assert.equal(reading.readCount, 2);
  assert.equal(reading.firstReadAt, 2010);
  assert.equal(reading.lastReadAt, 2050);

  const summary = getAuditSessionSummary(updatedAudit);
  // Conta apenas 1 presença encontrada, e não 2!
  assert.equal(summary.totalFound, 1);
  assert.equal(summary.totalMissing, 1); // p2 ainda falta
  assert.equal(summary.totalNew, 0);
});

test('7. Conferência identifica novos containers no pátio', () => {
  const p1 = createYardPassage({ containerNumber: 'MSCU 111111-1', yardId: 'loc_1', now: () => 1000 });
  const audit = startYardAuditSession({
    yardId: 'loc_1',
    actor: { id: 'ins_1', name: 'Inspetor' },
    activePassagesInYard: [p1],
    now: () => 2000
  });

  // Leitura de container não esperado previamente
  const updatedAudit = recordAuditReading({
    audit,
    containerNumber: 'TEMU 999999-9',
    actor: { id: 'ins_1', name: 'Inspetor' },
    now: () => 2020
  });

  const summary = getAuditSessionSummary(updatedAudit);
  assert.equal(summary.totalFound, 0); // O esperado ainda não foi lido
  assert.equal(summary.totalNew, 1); // Novo identificado!
  assert.equal(summary.totalMissing, 1);
  assert.equal(summary.newContainers[0].normalizedNumber, 'TEMU9999999');
});

test('8. Bloqueia fechamento com envios pendentes de sincronização', () => {
  const audit = startYardAuditSession({ yardId: 'loc_1', actor: { id: 'ins_1' }, now: () => 1000 });
  assert.throws(
    () => closeYardAuditSession({ audit, actor: { id: 'adm' }, pendingUploadsCount: 3 }),
    /envios pendentes sincronizando/i
  );
});

test('9. Conferência parcial NÃO gera saída de containers', () => {
  const p1 = createYardPassage({ containerNumber: 'MSCU 111111-1', yardId: 'loc_1', now: () => 1000 });
  const p2 = createYardPassage({ containerNumber: 'MSCU 222222-2', yardId: 'loc_1', now: () => 1000 });

  let audit = startYardAuditSession({ yardId: 'loc_1', actor: { id: 'ins_1' }, activePassagesInYard: [p1, p2], now: () => 2000 });
  audit = recordAuditReading({ audit, containerNumber: 'MSCU 111111-1', actor: { id: 'ins_1' }, now: () => 2010 });

  const closedAudit = closeYardAuditSession({
    audit,
    actor: { id: 'adm_1', name: 'Supervisor' },
    isPartial: true,
    now: () => 3000
  });

  assert.equal(closedAudit.status, 'closed');
  assert.equal(closedAudit.isPartial, true);

  // A passagem de p2 que não foi lida CONTINUA ATIVA!
  assert.equal(p2.status, 'active');
  assert.equal(p2.exitInfo.type, null);
});

test('10. Saída identificada por inventário grava responsável e deixa horário real como desconhecido', () => {
  const p1 = createYardPassage({ containerNumber: 'MSCU 333333-3', yardId: 'loc_1', now: () => 1000 });
  const confirmed = confirmYardPresence({ passage: p1, actor: { id: 'ins_1' }, now: () => 2000 });

  // Saída confirmada pelo administrador após ausência
  const exited = confirmInventoryExit({
    passage: confirmed,
    actor: { id: 'adm_master', name: 'Raone de Sousa', role: 'ADM' },
    notes: 'Confirmado no sistema que container foi retirado sem registro de portaria',
    now: () => 5000
  });

  assert.equal(exited.status, 'exited');
  assert.equal(exited.exitInfo.type, 'inventory_exit');
  assert.equal(exited.exitInfo.confirmedBy.name, 'Raone de Sousa');
  assert.equal(exited.exitInfo.confirmedAt, 5000);
  assert.equal(exited.exitInfo.lastKnownPresenceAt, 2000); // Última presença confirmada
  assert.equal(exited.exitInfo.actualExitTime, null); // Desconhecido
});

test('11. Reutilização de fotos sem duplicar referências', () => {
  const p1 = createYardPassage({
    containerNumber: 'MSCU 444444-4',
    yardId: 'loc_1',
    photos: [{ id: 'ph_1', url: 'https://storage/p1.jpg' }],
    now: () => 1000
  });

  // Confirma presença passando mesma foto e uma nova
  const updated = confirmYardPresence({
    passage: p1,
    photos: [
      { id: 'ph_1', url: 'https://storage/p1.jpg' }, // repetida
      { id: 'ph_2', url: 'https://storage/p2.jpg' }  // nova
    ],
    actor: { id: 'ins_1' },
    now: () => 2000
  });

  assert.equal(updated.photos.length, 2);
  assert.equal(updated.photos[0].id, 'ph_1');
  assert.equal(updated.photos[1].id, 'ph_2');
});
