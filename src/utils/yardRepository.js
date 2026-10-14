/**
 * yardRepository.js
 * Camada de repositório e transações atômicas no servidor/Firestore para o Inventário de Pátio.
 * Garante unicidade estrita de passagem ativa por pátio e integridade transacional de conferências.
 */

import {
  normalizeContainerCode,
  createYardPassage,
  confirmYardPresence,
  confirmInventoryExit,
  generateYardPassageId
} from './yardInventory.js';

export function makeYardLockKey(yardId, normalizedNumber) {
  return `${yardId}_${normalizeContainerCode(normalizedNumber)}`;
}

/**
 * Cria o repositório com suporte a transação atômica (Firestore ou simulada em testes).
 */
export function createYardRepository({
  reference,
  transaction,
  getDoc,
  now = () => Date.now()
}) {
  return {
    /**
     * CADASTRO ATÔMICO DE PASSAGEM COM LOCK EXCLUSIVO NO SERVIDOR.
     * Impede que duas requisições paralelas (ex: dois celulares ao mesmo tempo)
     * criem duas passagens ativas para o mesmo container no mesmo pátio.
     */
    async openYardPassageAtomic({
      containerNumber,
      yardId,
      yardName,
      actor,
      bookingId = null,
      bookingNumber = null,
      photos = [],
      notes = ''
    }) {
      const normalizedNumber = normalizeContainerCode(containerNumber);
      if (!normalizedNumber) throw new Error('Número de container inválido.');
      if (!yardId) throw new Error('Pátio é obrigatório.');

      const lockKey = makeYardLockKey(yardId, normalizedNumber);
      const lockRef = reference('yardActiveLocks', lockKey);

      return transaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);

        if (lockSnap && lockSnap.exists()) {
          const lockData = lockSnap.data();
          if (lockData.status === 'active') {
            // Conflito atômico detectado no servidor: já existe passagem ativa neste pátio!
            // Busca a passagem existente e confirma a presença nela em vez de duplicar.
            const existingPassageRef = reference('yardPassages', lockData.passageId);
            const passageSnap = await tx.get(existingPassageRef);
            if (passageSnap && passageSnap.exists()) {
              const existingPassage = passageSnap.data();
              const updated = confirmYardPresence({
                passage: existingPassage,
                actor,
                photos,
                notes: notes ? `Presença reafirmada: ${notes}` : 'Presença confirmada',
                now
              });
              tx.set(existingPassageRef, updated);
              return { passage: updated, isNew: false, conflictHandled: true };
            }
          }
        }

        // Lock disponível: cria nova passagem e grava o lock atômico
        const passage = createYardPassage({
          containerNumber,
          yardId,
          yardName,
          actor,
          bookingId,
          bookingNumber,
          photos,
          notes,
          now
        });

        const passageRef = reference('yardPassages', passage.id);

        // Grava passagem
        tx.set(passageRef, passage);

        // Grava lock exclusivo no servidor
        tx.set(lockRef, {
          lockKey,
          passageId: passage.id,
          normalizedNumber,
          containerNumber: passage.containerNumber,
          yardId,
          status: 'active',
          openedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
          createdAt: passage.createdAt,
          updatedAt: passage.updatedAt
        });

        return { passage, isNew: true, conflictHandled: false };
      });
    },

    /**
     * CONFIRMAÇÃO DE SAÍDA EXCLUSIVA DE ADMINISTRADOR COM LIBERAÇÃO ATÔMICA DO LOCK.
     */
    async confirmExitAtomic({ passageId, actor, notes = '' }) {
      if (!actor || actor.role !== 'ADM') {
        throw new Error('Apenas administradores podem confirmar a saída de containers identificada por inventário.');
      }

      const passageRef = reference('yardPassages', passageId);

      return transaction(async (tx) => {
        const snap = await tx.get(passageRef);
        if (!snap || !snap.exists()) throw new Error('Passagem não encontrada.');

        const passage = snap.data();
        if (passage.status === 'exited') {
          throw new Error('Esta passagem já foi finalizada como saída.');
        }

        const updated = confirmInventoryExit({
          passage,
          actor,
          notes,
          now
        });

        tx.set(passageRef, updated);

        // Libera o lock atômico para permitir futuras passagens deste container no mesmo pátio
        const lockKey = makeYardLockKey(passage.yardId, passage.normalizedNumber);
        const lockRef = reference('yardActiveLocks', lockKey);
        tx.delete(lockRef);

        return updated;
      });
    },

    /**
     * INICIA A ETAPA DE FECHAMENTO DA CONFERÊNCIA.
     * Impede novas leituras regulares de entrarem sem reconciliação explícita.
     */
    async beginYardAuditClosingAtomic({ auditId, actor }) {
      const auditRef = reference('yardAudits', auditId);
      return transaction(async (tx) => {
        const snap = await tx.get(auditRef);
        if (!snap || !snap.exists()) throw new Error('Conferência não encontrada.');
        const audit = snap.data();
        if (audit.status === 'closed') throw new Error('Conferência já está fechada.');

        const timestamp = now();
        const updated = {
          ...audit,
          status: 'closing',
          closingStartedAt: timestamp,
          closingStartedBy: { id: actor?.id || 'sys', name: actor?.name || 'Supervisor', role: actor?.role || 'ADM' },
          updatedAt: timestamp
        };
        tx.set(auditRef, updated);
        return updated;
      });
    },

    /**
     * FECHAMENTO DE CONFERÊNCIA COM VALIDAÇÃO DE SINCRONIZAÇÃO DE TODOS OS APARELHOS.
     * REGRA CRÍTICA:
     * 1. Se qualquer aparelho participante estiver sem confirmação de sincronização recente,
     *    com uploads pendentes ou com status offline/antigo, o fechamento é BLOQUEADO.
     *    Informação antiga de "online" ou fila zerada não é suficiente.
     * 2. Containers ausentes são colocados sob 'under_review' (nunca saída automática).
     */
    async closeYardAuditAtomic({
      auditId,
      actor,
      isPartial = false,
      participatingDevices = {},
      maxStalenessMs = 60000
    }) {
      const auditRef = reference('yardAudits', auditId);

      return transaction(async (tx) => {
        const snap = await tx.get(auditRef);
        if (!snap || !snap.exists()) throw new Error('Conferência não encontrada.');

        const audit = snap.data();
        if (audit.status === 'closed') throw new Error('Conferência já está fechada.');

        const timestamp = now();

        // Verifica o status de todos os aparelhos participantes
        const unconfirmedDevices = [];
        Object.entries(participatingDevices).forEach(([deviceId, info]) => {
          const isSynced = Boolean(info.isConfirmedSynced);
          const pendings = Number(info.pendingUploads || 0);
          const lastSync = info.lastSyncConfirmedAt !== undefined ? Number(info.lastSyncConfirmedAt) : null;
          const isStale = lastSync !== null ? (lastSync <= 0 || (timestamp - lastSync) > maxStalenessMs) : false;

          if (pendings > 0 || !isSynced || isStale) {
            let reason = '';
            if (pendings > 0) {
              reason = `${pendings} pendentes`;
            } else if (isStale) {
              const diffSec = lastSync ? Math.round((timestamp - lastSync) / 1000) : 'indisponível';
              reason = `sincronização antiga há ${diffSec}s sem confirmação recente`;
            } else if (!isSynced) {
              reason = 'sem confirmação de sincronização';
            }

            unconfirmedDevices.push({
              deviceId,
              inspectorName: info.inspectorName || 'Inspetor',
              reason
            });
          }
        });

        if (unconfirmedDevices.length > 0) {
          const names = unconfirmedDevices.map(d => `${d.inspectorName} (${d.reason})`).join(', ');
          throw new Error(`Não é possível fechar a conferência. Há aparelhos participantes sem confirmação de sincronização: ${names}. Informação antiga de "online" ou fila zerada não é suficiente. Aguarde o descarregamento de todos os aparelhos.`);
        }

        // Se conferência completa, atualiza passagens esperadas não encontradas para 'under_review'
        const expected = audit.expectedContainers || [];
        const readings = audit.readings || {};
        const missingContainers = expected.filter(exp => !readings[exp.normalizedNumber]);

        if (!isPartial && missingContainers.length > 0) {
          for (const missing of missingContainers) {
            const pRef = reference('yardPassages', missing.passageId);
            const pSnap = await tx.get(pRef);
            if (pSnap && pSnap.exists()) {
              const currentPassage = pSnap.data();
              if (currentPassage.status === 'active') {
                const event = {
                  id: `yev_${currentPassage.id}_${timestamp}_review`,
                  passageId: currentPassage.id,
                  containerNumber: currentPassage.containerNumber,
                  yardId: currentPassage.yardId,
                  auditId,
                  type: 'under_review',
                  title: 'Ausência constatada em conferência fechada',
                  actor: { id: actor?.id || 'sys', name: actor?.name || 'Supervisor', role: actor?.role || 'ADM' },
                  timestamp,
                  notes: `Container não encontrado na conferência ${auditId}. Colocado sob revisão humana do administrador.`
                };

                tx.set(pRef, {
                  ...currentPassage,
                  status: 'under_review',
                  events: [...(currentPassage.events || []), event],
                  updatedAt: timestamp
                });
              }
            }
          }
        }

        const updated = {
          ...audit,
          status: 'closed',
          isPartial: Boolean(isPartial),
          closedAt: timestamp,
          closedBy: { id: actor?.id || 'sys', name: actor?.name || 'Supervisor' },
          updatedAt: timestamp
        };

        tx.set(auditRef, updated);
        return updated;
      });
    },

    /**
     * TRATAMENTO DE LEITURA QUE CHEGA ATRASADA APÓS O FECHAMENTO DA CONFERÊNCIA.
     * REGRAS CRÍTICAS:
     * 1. Mantém referência estrita à conferência e à passagem originais.
     * 2. NÃO reativa passagem já encerrada (status 'exited').
     * 3. NÃO modifica outra passagem do mesmo container.
     * 4. Se a passagem original estava encerrada, encaminha conflito para revisão do administrador.
     * 5. Se o container estava em 'under_review', reverte automaticamente para 'active'.
     */
    async processLateAuditReadingAtomic({
      auditId,
      containerNumber,
      capturedAt,
      actor,
      notes = '',
      originalPassageId = null
    }) {
      const normalizedNumber = normalizeContainerCode(containerNumber);
      const auditRef = reference('yardAudits', auditId);

      return transaction(async (tx) => {
        const auditSnap = await tx.get(auditRef);
        if (!auditSnap || !auditSnap.exists()) throw new Error('Conferência não encontrada.');
        const audit = auditSnap.data();

        let targetPassage = null;
        let passageRef = null;

        // 1. Identifica a passagem original: via originalPassageId ou expectedContainers da conferência
        let targetId = originalPassageId;
        if (!targetId && audit.expectedContainers) {
          const exp = audit.expectedContainers.find(c => c.normalizedNumber === normalizedNumber);
          if (exp?.passageId) targetId = exp.passageId;
        }

        if (targetId) {
          passageRef = reference('yardPassages', targetId);
          const pSnap = await tx.get(passageRef);
          if (pSnap && pSnap.exists()) targetPassage = pSnap.data();
        }

        // Se ainda não encontrou passagem e há lock ativo no pátio da conferência:
        if (!targetPassage) {
          const lockKey = makeYardLockKey(audit.yardId, normalizedNumber);
          const lockRef = reference('yardActiveLocks', lockKey);
          const lockSnap = await tx.get(lockRef);
          if (lockSnap && lockSnap.exists()) {
            const lockData = lockSnap.data();
            passageRef = reference('yardPassages', lockData.passageId);
            const pSnap = await tx.get(passageRef);
            if (pSnap && pSnap.exists()) targetPassage = pSnap.data();
          }
        }

        const timestamp = now();

        // CASO 1: Passagem já foi confirmada como SAÍDA (status === 'exited')
        // REGRA CRÍTICA: NÃO reativar passagem já encerrada nem modificar outra passagem do mesmo container!
        // Encaminhar conflito para revisão do administrador.
        if (targetPassage && targetPassage.status === 'exited') {
          const conflictRecord = {
            id: `conf_${normalizedNumber}_${timestamp}`,
            type: 'late_reading_on_exited_passage',
            containerNumber,
            normalizedNumber,
            auditId,
            passageId: targetPassage.id,
            capturedAt: capturedAt || timestamp,
            receivedAt: timestamp,
            actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor', role: actor?.role || 'Inspector' },
            status: 'pending_admin_review',
            flaggedForAdminReview: true,
            conflictMessage: `Container ${containerNumber} teve saída confirmada pelo administrador em ${targetPassage.exitInfo?.confirmedAt ? new Date(targetPassage.exitInfo.confirmedAt).toLocaleString('pt-BR') : 'data anterior'}. A leitura atrasada foi retida para auditoria sem reativar a passagem encerrada nem alterar outras passagens.`,
            notes: notes || ''
          };

          const lateReadings = { ...(audit.lateReadings || {}) };
          lateReadings[normalizedNumber] = {
            containerNumber,
            capturedAt,
            syncedAt: timestamp,
            actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
            auditId,
            originalPassageId: targetPassage.id,
            conflict: 'passage_already_exited',
            flaggedForAdminReview: true,
            notes
          };

          const pendingConflicts = Array.isArray(audit.pendingConflicts) ? [...audit.pendingConflicts] : [];
          pendingConflicts.push(conflictRecord);

          const updatedAudit = {
            ...audit,
            lateReadings,
            pendingConflicts,
            updatedAt: timestamp
          };

          tx.set(auditRef, updatedAudit);

          return {
            passage: targetPassage,
            audit: updatedAudit,
            conflict: conflictRecord,
            flaggedForAdminReview: true,
            recoveredFromReview: false
          };
        }

        // CASO 2: Passagem ativa ou em revisão no pátio
        if (targetPassage) {
          const event = {
            id: `yev_${targetPassage.id}_${timestamp}_late`,
            passageId: targetPassage.id,
            containerNumber: targetPassage.containerNumber,
            yardId: targetPassage.yardId,
            auditId,
            type: 'late_audit_reading',
            title: 'Leitura de conferência recebida pós-fechamento',
            actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor', role: actor?.role || 'Inspector' },
            timestamp: capturedAt || timestamp,
            syncedAt: timestamp,
            notes: `Leitura física capturada às ${new Date(capturedAt).toLocaleTimeString('pt-BR')}, sincronizada após fechamento da conferência. ${notes}`
          };

          const updatedPassage = {
            ...targetPassage,
            status: 'active', // Se estava em under_review, reativa com segurança
            lastConfirmedAt: Math.max(targetPassage.lastConfirmedAt || 0, capturedAt || timestamp),
            lastConfirmedBy: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
            events: [...(targetPassage.events || []), event],
            updatedAt: timestamp
          };

          tx.set(passageRef, updatedPassage);
        }

        // Anexa a leitura extemporânea na conferência para histórico
        const lateReadings = { ...(audit.lateReadings || {}) };
        lateReadings[normalizedNumber] = {
          containerNumber,
          capturedAt,
          syncedAt: timestamp,
          actor: { id: actor?.id || 'sys', name: actor?.name || 'Inspetor' },
          auditId,
          originalPassageId: targetPassage?.id || null,
          notes
        };

        const updatedAudit = {
          ...audit,
          lateReadings,
          updatedAt: timestamp
        };
        tx.set(auditRef, updatedAudit);

        return {
          passage: targetPassage,
          audit: updatedAudit,
          recoveredFromReview: targetPassage ? targetPassage.status === 'under_review' : false
        };
      });
    },

    /**
     * RESOLUÇÃO ADMINISTRATIVA DE CONFLITO DE AUDITORIA.
     */
    async resolveYardConflictAtomic({
      auditId,
      conflictId,
      resolution, // 'keep_exited' | 'open_new_passage'
      actor,
      notes = ''
    }) {
      if (!actor || actor.role !== 'ADM') {
        throw new Error('Apenas administradores podem resolver conflitos de conferência.');
      }

      const auditRef = reference('yardAudits', auditId);

      return transaction(async (tx) => {
        const snap = await tx.get(auditRef);
        if (!snap || !snap.exists()) throw new Error('Conferência não encontrada.');
        const audit = snap.data();

        const conflicts = Array.isArray(audit.pendingConflicts) ? [...audit.pendingConflicts] : [];
        const idx = conflicts.findIndex(c => c.id === conflictId);
        if (idx === -1) throw new Error('Conflito não encontrado na conferência.');

        const timestamp = now();
        conflicts[idx] = {
          ...conflicts[idx],
          resolved: true,
          resolvedAt: timestamp,
          resolvedBy: { id: actor.id, name: actor.name || 'Administrador' },
          resolution,
          adminNotes: notes || ''
        };

        const updatedAudit = {
          ...audit,
          pendingConflicts: conflicts,
          updatedAt: timestamp
        };

        tx.set(auditRef, updatedAudit);
        return { audit: updatedAudit, conflict: conflicts[idx] };
      });
    }
  };
}
