# LIMITAÇÕES E ANÁLISE DE RISCO DO RETORNO À VERSÃO ANTIGA (v2.2.1)

> **Documento de Governança Técnica e Gestão de Riscos**  
> **Finalidade:** Mapear as restrições reais de rollback, impedindo falsas premissas de compatibilidade automática.

---

## 1. Visão Geral do Risco de Retorno

A transição de uma arquitetura mono-tenant para multi-cliente envolve alterações na camada de **autenticação**, **regras de segurança da nuvem**, **esquema de dados** e **ciclo de vida de cache (PWA)**. 

Não se deve presumir compatibilidade automática entre a versão antiga (`v2.2.1`) e o banco de dados modificado. Este documento detalha cada limitação técnica e os pré-requisitos para que um eventual procedimento de contingência não resulte em indisponibilidade operacional.

---

## 2. Limitação Crítica de Autenticação

- **Mecanismo da v2.2.1:**  
  O código atual em `src/components/Login.jsx` executa consulta direta em `/usuarios` e valida credenciais no navegador através da comparação síncrona `u.password === password` (senha em texto plano), gravando o objeto no `localStorage`.
- **O Risco no Retorno:**  
  Ao migrar para o **Firebase Authentication**, as senhas passarão a ser gerenciadas pelo serviço criptográfico do Google. Se os campos de senha em texto plano na coleção `/usuarios` forem removidos ou limpos durante a migração, **a versão v2.2.1 perderá a capacidade de autenticar qualquer usuário**.
- **Condição Obrigatória de Salvaguarda:**  
  Durante todo o período de transição da INTERPORT, a coleção legada `/usuarios` deve ser preservada em estado somente-leitura (sem exclusão de registros) até que a versão multi-cliente seja homologada e declarada como definitiva.

---

## 3. Limitação Crítica de Regras de Segurança (Firestore e Storage)

- **Comportamento da v2.2.1:**  
  A versão v2.2.1 não instancia `firebase/auth`. Todas as requisições enviadas ao Firestore e ao Storage partem de um cliente não autenticado pela SDK oficial (sem token JWT acoplado).
- **O Risco no Retorno:**  
  Quando as novas regras multi-cliente forem publicadas na nuvem, elas exigirão formalmente:
  ```
  allow read, write: if request.auth != null && request.auth.token.clientId != null;
  ```
  Se a aplicação web no Railway ou o APK nos celulares for revertido para a v2.2.1 **sem a reversão imediata e sincronizada das regras no console do Firebase**, todos os operadores receberão imediatamente o erro:
  `FirebaseError: Missing or insufficient permissions.`
- **Condição Obrigatória de Salvaguarda:**  
  O procedimento de rollback exige obrigatoriamente a reversão síncrona das regras de segurança ativas na nuvem via comando `firebase deploy --only firestore:rules,storage:rules` utilizando o arquivo de regras de contingência salvo previamente. Reverter apenas o código no Git causará paralisação do sistema.

---

## 4. Limitação de Dados Criados Durante a Janela de Operação Nova

- **O Risco de Contaminação:**  
  Se a nova versão operar em produção durante algumas horas e registrar novos Bookings, contêineres e fotos:
  1. **Se novos clientes já estiverem cadastrados:** A versão v2.2.1 (por não possuir o conceito de filtro por cliente) baixará todos os Bookings do banco e **exibirá cargas de clientes distintos na mesma tela**, violando o sigilo comercial.
  2. **Chaves de Unicidade:** Se as novas chaves forem gravadas com prefixo (`client_interport_BKG01`), a versão v2.2.1 não as reconhecerá e poderá permitir a criação duplicada do mesmo número de booking, corrompendo a unicidade.
- **Condição Obrigatória de Salvaguarda (Quarentena):**  
  Nenhum cliente novo poderá ser liberado para produção durante a fase de transição da INTERPORT. A INTERPORT deve ser o único cliente ativo até a consolidação da estabilidade.

---

## 5. Limitação de Cache, PWA e Filas Móveis (IndexedDB)

- **Comportamento dos Aparelhos Móveis:**  
  Os celulares dos inspetores possuem Service Workers registrados com estratégias de cache agressivas (`clientsClaim: true`, `skipWaiting: true`) e filas locais em IndexedDB (`unispect-field-captures-v1`).
- **O Risco no Retorno:**  
  Se um inspetor capturar vistorias no modelo novo e o sistema sofrer rollback antes do envio, a fila local do celular conterá dados estruturados para a versão nova. Ao tentar sincronizar contra a versão antiga, o motor de envio poderá falhar ou travar na fila.
- **Condição Obrigatória de Salvaguarda:**  
  Qualquer decisão de retorno exige confirmação prévia de que todos os dispositivos móveis descarregaram suas filas pendentes ou que o procedimento de contingência inclua instrução para limpeza de cache e recarga completa da PWA (`localStorage.setItem('unispect_app_build', Date.now())`).

---

## 6. Checklist de Contingência para Decisão de Rollback

Antes de autorizar o retorno para a versão v2.2.1, o comitê técnico deve cumprir o checklist obrigatório:

- [ ] Confirmar que nenhum segundo cliente cadastrou dados reais em produção.
- [ ] Validar que a coleção `/usuarios` preserva a compatibilidade de login da v2.2.1.
- [ ] Ter o arquivo de regras de contingência pronto para publicação imediata no console Firebase.
- [ ] Garantir que nenhum aparelho de campo está com sincronização em andamento.
- [ ] Disparar script de verificação de integridade pós-reversão para comprovar que nenhuma foto gravada no Storage foi perdida.
