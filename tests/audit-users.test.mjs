import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditUsersCollection } from '../tools/audit/audit-users.mjs';

test('1. Auditoria de Usuários: identifica usuários aptos e anomalias sem expor senhas', () => {
  const dataset = JSON.parse(readFileSync('tests/fixtures/synthetic-dataset.json', 'utf-8'));
  const usersList = Object.values(dataset.usuarios);

  const report = auditUsersCollection(usersList);

  assert.equal(report.totalUsers, 5);
  // No synthetic-dataset:
  // usr_master: apto
  // usr_interport_adm: apto
  // usr_insp: email duplicado com usr_duplicate_email
  // usr_invalid_no_email: sem email
  // usr_duplicate_email: email duplicado com usr_insp
  assert.equal(report.issues.missingEmail.length, 1);
  assert.equal(report.issues.missingEmail[0].userId, 'usr_invalid_no_email');

  assert.equal(report.issues.duplicateEmails.length, 2);
  assert.ok(report.issues.duplicateEmails.some(u => u.userId === 'usr_insp'));
  assert.ok(report.issues.duplicateEmails.some(u => u.userId === 'usr_duplicate_email'));

  // Garante que NENHUM campo de senha ou credencial vazou no relatório
  const reportString = JSON.stringify(report);
  assert.equal(reportString.includes('hash_secret_mock'), false, 'Nenhuma senha pode aparecer no relatório');
  assert.equal(reportString.includes('"password"'), false, 'Propriedade password não pode existir no relatório');
});

test('2. Auditoria de Usuários: valida conformidade de UID para Firebase Auth', () => {
  const invalidUsers = [
    { id: 'usr with space and special @!', email: 'valido@teste.com', role: 'Inspector' }
  ];

  const report = auditUsersCollection(invalidUsers);
  assert.equal(report.issues.incompatibleUid.length, 1);
  assert.equal(report.issues.incompatibleUid[0].userId, 'usr with space and special @!');
});
