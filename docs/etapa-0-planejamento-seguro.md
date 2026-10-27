# ETAPA 0 — PLANO DE PREPARAÇÃO SEGURA E MIGRAÇÃO MULTI-CLIENTE (UNISPECT)

> **Documento de Planejamento e Governança Técnica**  
> **Versão do Sistema Alvo:** Unispect Service v2.2.1  
> **Status:** Somente Leitura e Planejamento. Nenhuma alteração aplicada em produção.  
> **Nota de Auditoria:** As etapas de backup, isolamento e restauração estão estritamente planejadas e **não** são consideradas concluídas até a execução comprovada e auditada com evidências.

---

## 1. Identificação da Versão do Código e Estado do Repositório

- **Repositório Git:** `https://github.com/unispectcertificates-cyber/unispect-service-app.git`
- **Branch Ativa:** `master` (sincronizada com `origin/master`)
- **Commit Atual:** `01efdfa` — *fix(mobile): corrigir exclusao definitiva de fotos de containers e evitar retorno da foto*
- **Histórico Imediato (Últimos Commits):**
  - `01efdfa` fix(mobile): corrigir exclusao definitiva de fotos de containers e evitar retorno da foto
  - `433b171` fix(desktop): corrigir Minified React error #310 na insercao/atualizacao de romaneios
  - `a4aab7d` fix(build): sincronizar versao v2.2.1 no package-lock.json para deploy no Railway
  - `33a735e` chore(release): atualizar versao visivel para v2.2.1 no Sidebar, Mobile e package.json para deploy no Railway
  - `d4efdb4` fix(romaneio): bloquear estritamente numeros e digitos de container como lacre e extrair lacres multiplos 005780 / 005947 (v2.1.2)
- **Estado da Árvore de Trabalho:** Limpa (`working tree clean`). Nenhuma alteração pendente de commit.
- **Versão nos Pacotes:**
  - `package.json`: `"version": "2.2.1"`
  - `src/main.jsx`: `CURRENT_APP_BUILD = '2026.10.19.r3'`
  - `Sidebar.jsx`: Exibição visual `v2.2.1`

---

## 2. Destinos Reais de Publicação e Segregação de Ambientes

### 2.1. Destinos Identificados
1. **Railway (Produção Web Principal):**
   - Configurado via `railway.toml`: compilação via Nixpacks (`npm run build`) e execução estática via `serve -s dist -l $PORT`.
   - Conectado diretamente à branch `master` do GitHub.
2. **GitHub Pages (Deploy Secundário / Distribuição):**
   - Configurado no script `"deploy": "gh-pages -d dist"` do `package.json`.
3. **Distribuição Android (APK / PWA Encapsulado):**
   - Arquivo `Unispect.apk` distribuído para aparelhos móveis dos inspetores.

### 2.2. Mecanismo Atual e Segregação Futura
- **Situação Atual:** As credenciais do projeto Firebase (`unispect-service`) estão definidas de forma estática em `src/firebase.js`. Qualquer build produzido aponta para o banco de produção da INTERPORT, salvo em execução local com a flag `unispect_use_emulator` ativada em `localStorage`.
- **Estratégia de Segregação Segura (Sem Expor Credenciais):**
  - Introduzir variáveis de ambiente no Vite:
    - `.env.production` (aponta para `unispect-service`)
    - `.env.staging` (aponta para `unispect-service-staging`)
  - A publicação em Railway/GitHub Pages deverá vincular explicitamente a variável `VITE_APP_ENV` para impedir que um deploy de testes aponte acidentalmente para o banco de produção.

---

## 3. Modelo de Papéis e Matriz de Permissões (Separação Master vs. Cliente)

### 3.1. Definição Estrita dos Papéis (Roles)
Não se deve conceder permissão de Master automaticamente a nenhum usuário administrativo existente. A governança do sistema estabelece quatro funções fundamentais:

1. **`UNISPECT_MASTER` (Superadministrador UNISPECT):**
   - Membro corporativo da UNISPECT.
   - Gestão global da plataforma: cadastra clientes contratantes, configura regras operacionais, gerencia inspetores credenciados e acessa auditorias multi-cliente.
   - Claim: `{ role: 'UNISPECT_MASTER', isUnispectMaster: true, authorizedClients: ['*'] }`.
2. **`CLIENT_ADMIN` (Administrador de Cliente Contratante - ex: INTERPORT):**
   - Gestor operacional da empresa contratante.
   - Gerencia Bookings, importações de romaneios, emissão de laudos, cadastros de recintos e usuários pertencentes **exclusivamente** ao seu próprio `clientId`.
   - **Não** possui visão nem poderes sobre outros clientes da UNISPECT.
   - Claim: `{ role: 'CLIENT_ADMIN', isUnispectMaster: false, authorizedClients: ['client_interport'] }`.
3. **`INSPECTOR` (Inspetor de Campo UNISPECT):**
   - Realiza vistorias físicas, preenchimento de checklists, captura de fotos e conferência de pátio.
   - Atua exclusivamente nos clientes para os quais foi escalado e autorizado.
   - Claim: `{ role: 'INSPECTOR', isUnispectMaster: false, authorizedClients: ['client_interport', 'client_terminal_b'] }`.
4. **`EXPORTER` (Cliente Exportador da Carga):**
   - Representante da trading/exportadora (ex: Café Atlântica, Tristão).
   - Acesso estritamente **somente-leitura**, restrito aos Bookings e Laudos em que `exporterId` corresponde à sua empresa, sob o cliente contratante em questão.
   - Claim: `{ role: 'EXPORTER', isUnispectMaster: false, authorizedClients: ['client_interport'], exporterId: 'exp_1' }`.

### 3.2. Matriz de Permissões para Revisão

| Funcionalidade / Operação | `UNISPECT_MASTER` | `CLIENT_ADMIN` | `INSPECTOR` | `EXPORTER` |
| :--- | :---: | :---: | :---: | :---: |
| **Criar / Editar Clientes Contratantes** | Sim (Global) | Não | Não | Não |
| **Importar Romaneios / Criar Bookings** | Sim | Sim (Seu Cliente) | Não | Não |
| **Editar Contêiner / Inserir Vistoria** | Sim | Sim (Seu Cliente) | Sim (Autorizado) | Não |
| **Excluir Booking e Contêineres** | Sim | Sim (Seu Cliente) | Não | Não |
| **Finalizar Booking (Conclusão)** | Sim | Sim (Seu Cliente) | Sim (Autorizado) | Não |
| **Visualizar / Baixar Laudos e Certificados** | Sim | Sim (Seu Cliente) | Sim (Autorizado) | Sim (Somente suas cargas) |
| **Entrada / Conferência de Pátio (Auditoria)** | Sim | Sim (Seu Cliente) | Sim (Autorizado) | Não |
| **Baixa / Saída Definitiva de Pátio (`exited`)** | Sim | Sim (Seu Cliente) | Não | Não |
| **Gerenciar Usuários e Inspetores do Cliente** | Sim | Sim (Seu Cliente) | Não | Não |
| **Painel de Analytics e KPIs Globais** | Sim (Todos) | Sim (Seu Cliente) | Não | Não |

### 3.3. Padronização de IDs, Atualização e Revogação Imediata de Acesso

- **Formato Canônico do Cliente:** Identificador padronizado em minúsculas e sem caracteres especiais: `client_[identificador]` (ex: `client_interport`, `client_terminal_b`).
- **Atualização de Permissões:**
  - Executada exclusivamente via Firebase Admin SDK por chamada autenticada de `UNISPECT_MASTER`.
  - Atualiza as Custom Claims do usuário e grava histórico de concessão em `/userAuditLogs`.
- **Procedimento de Revogação Imediata (Sem aguardar 1h de expiração do JWT):**
  1. O backend revoga a sessão do usuário: `admin.auth().revokeRefreshTokens(uid)`.
  2. Atualiza o documento de segurança `/userSecurityMetadata/{uid}` com o campo `revokedAt: admin.firestore.FieldValue.serverTimestamp()`.
  3. No cliente, força a renovação imediata do token via `auth.currentUser.getIdToken(true)` ou redireciona para a tela de login.

---

## 4. Modelagem das Regras de Segurança (Firestore & Storage)

> **AVISO OBRIGATÓRIO DE GOVERNANÇA:**  
> **NÃO PUBLIQUE ESTAS REGRAS EM PRODUÇÃO NESTE MOMENTO.**  
> Trata-se de modelagem conceitual para validação arquitetural prévia.

### 4.1. Conceito de Validação no Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isUnispectMaster() {
      return isAuthenticated() && request.auth.token.isUnispectMaster == true;
    }

    function hasClientAccess(targetClientId) {
      return isAuthenticated() && (
        isUnispectMaster() ||
        (request.auth.token.authorizedClients != null && targetClientId in request.auth.token.authorizedClients)
      );
    }

    function isClientAdmin(targetClientId) {
      return hasClientAccess(targetClientId) && (
        isUnispectMaster() || request.auth.token.role == 'CLIENT_ADMIN'
      );
    }

    // Regras para a coleção /bookings
    match /bookings/{bookingId} {
      // 1. LEITURA: Respeita isolamento de cliente e restrição de exportador
      allow read: if hasClientAccess(resource.data.clientId) && (
        request.auth.token.role != 'EXPORTER' ||
        resource.data.exporterId == request.auth.token.exporterId
      );

      // 2. CRIAÇÃO: Valida que o cliente de destino é autorizado e a função permite criação
      allow create: if hasClientAccess(request.resource.data.clientId) && (
        isClientAdmin(request.resource.data.clientId)
      );

      // 3. ATUALIZAÇÃO: Exige acesso ao documento existente e BLOQUEIA troca de clientId (imutabilidade)
      allow update: if hasClientAccess(resource.data.clientId) &&
        request.resource.data.clientId == resource.data.clientId && (
          isClientAdmin(resource.data.clientId) ||
          request.auth.token.role == 'INSPECTOR'
        );

      // 4. EXCLUSÃO: Restrita estritamente a administradores do cliente ou Master
      allow delete: if isClientAdmin(resource.data.clientId);
    }

    // Regras para /yardPassages (Histórico Imutável)
    match /yardPassages/{passageId} {
      allow read: if hasClientAccess(resource.data.clientId);
      allow create: if hasClientAccess(request.resource.data.clientId);
      allow update: if hasClientAccess(resource.data.clientId) &&
        request.resource.data.clientId == resource.data.clientId &&
        (request.resource.data.status != 'exited' || isClientAdmin(resource.data.clientId));
      allow delete: if false; // Deleção proibida para todos (preserva histórico pericial)
    }
  }
}
```

### 4.2. Conceito de Validação no Storage
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /containers/{containerId}/{photoFile} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                   request.resource.size <= 45 * 1024 && // Estrito: limite de 45 KB
                   request.resource.contentType == 'image/jpeg';
      allow delete: if request.auth.token.isUnispectMaster == true ||
                    request.auth.token.role == 'CLIENT_ADMIN';
    }
  }
}
```

---

## 5. Validação de Comandos, Ferramentas e Permissões Mínimas IAM

As ferramentas propostas operam com formatos distintos e **não** possuem compatibilidade automática garantida. A tabela abaixo especifica o comando, a versão oficial, a natureza do formato e as permissões mínimas IAM necessárias (descartando o uso desnecessário de privilégios como `Owner`).

| Ferramenta / Ação | Versão / Binário Oficial | Formato Real do Dado | Permissões Mínimas IAM Necessárias | Alertas de Compatibilidade |
| :--- | :--- | :--- | :--- | :--- |
| **Backup Gerenciado do Firestore** | Google Cloud SDK (`gcloud` v500+) | Nível de bloco LevelDB / Protocol Buffers (`.overall_export_metadata`) | `roles/datastore.importExportAdmin` no projeto e `roles/storage.objectAdmin` no bucket de backup. | Formato nativo da GCP para disaster recovery. Incompatível diretamente com SQLite ou JSON puro. |
| **Backup de Fotos do Storage** | Google Cloud SDK (`gcloud storage rsync`) | Binários brutos de arquivos JPEG com cabeçalhos HTTP | `roles/storage.objectViewer` no bucket de origem e `roles/storage.objectAdmin` no bucket de destino. | Transfere apenas os arquivos físicos. Não gera metadados de banco de dados. |
| **Exportação do Emulador Local** | Firebase Tools (`firebase-tools` v13.20+) | Formato proprietário de snapshot do emulador (`firestore_export/`) | Execução local sem permissão em nuvem. | Embora suporte import de `gcloud export`, versões antigas de Java ou `firebase-tools` podem falhar em tipos de dados compostos. Exige validação prévia. |
| **Inspeção de Regras e Índices** | Firebase CLI (`firebase firestore:rules:get`) | Arquivos de texto e JSON | `roles/firebaserules.viewer` no projeto GCP. | Comando estritamente de leitura. |

---

## 6. Procedimento de Teste de Fotos em Ambiente Isolado

### 6.1. O Desafio das URLs Absolutas
No banco atual, o campo `url` dos documentos em `/containerPhotos` e nos arrays `containers[].photos` armazena a URL pública absoluta apontando para a produção:  
`https://firebasestorage.googleapis.com/v0/b/unispect-service.firebasestorage.app/o/containers%2F...`  
Se a base for importada em um ambiente de testes sem intervenção, qualquer tentativa do navegador de carregar as fotos acessará o bucket de produção da INTERPORT, quebrando o isolamento e gerando falso-positivo de recuperação.

### 6.2. Estratégia de Isolamento e Conferência
1. **Resolução Dinâmica de URLs (Storage Resolver):**
   - O componente de exibição de imagens deve utilizar uma função de resolução de ambiente:
     ```javascript
     export function resolvePhotoUrl(photo, environment) {
       if (environment.isEmulator) {
         return `http://localhost:9199/v0/b/${environment.storageBucket}/o/${encodeURIComponent(photo.storagePath)}?alt=media`;
       }
       if (environment.isStaging) {
         return `https://firebasestorage.googleapis.com/v0/b/unispect-service-staging.firebasestorage.app/o/${encodeURIComponent(photo.storagePath)}?alt=media`;
       }
       return photo.url; // Produção
     }
     ```
2. **Conferência Automatizada de Conteúdo e Integridade Física:**
   O script de conferência deve analisar o bucket restaurado sem abrir o navegador:
   - **Existência:** 100% dos `storagePath` registrados no Firestore devem existir no bucket de backup.
   - **Tamanho:** Cada foto deve ter `size > 0` e `size <= 45.000 bytes` (regra de compressão Unispect).
   - **Tipo MIME:** `contentType === 'image/jpeg'`.
   - **Checksum:** Validação de integridade via hash MD5 / CRC32c gerado pelo Cloud Storage.

---

## 7. Procedimento de Retorno Seguro (Rollback Bidirecional sem Desprefixação)

### 7.1. Por que Desprefixar Chaves é Inviável
A tentativa de reverter dados removendo prefixos de chaves (ex: converter `client_interport_ABC` em `ABC`) é uma operação destrutiva: caso existam registros concomitantes de múltiplos clientes, a desprefixação causará colisões irrecuperáveis e sobrescrita de documentos.

### 7.2. Estratégia de Quarentena e Compatibilidade Dual
1. **Quarentena Estrita do Segundo Cliente:**
   - O cadastro e liberação de um novo cliente (Cliente B) **não** ocorrerão na virada inicial.
   - Apenas a INTERPORT operará na nova versão durante a fase de validação (14 dias).
2. **Formato Dual-Compatible para a INTERPORT:**
   - Para a INTERPORT, os IDs de documentos e as chaves originais de romaneio serão preservados como chave canônica primária, adicionando o atributo `clientId: 'client_interport'`.
   - Se houver necessidade de rollback de emergência:
     - O código da versão v2.2.1 é republicado.
     - Como a versão v2.2.1 simplesmente ignora o campo `clientId` e lê os mesmos documentos e caminhos, a operação da INTERPORT continua imediatamente sem necessidade de scripts de alteração em massa no banco.
3. **Critério para Liberação de Novos Clientes:**
   - A criação de novos clientes só será desbloqueada após homologação formal da estabilidade da INTERPORT e confirmação de isolamento com zero apontamentos de não conformidade.

---

## 8. Saneamento de Usuários e Mecanismo de Entrega de Acesso

### 8.1. Correção Técnica: Geração de Link vs. Entrega de E-mail
O método `admin.auth().generatePasswordResetLink(email)` apenas retorna uma string de URL; ele **não** envia e-mails aos usuários. Para garantir a entrega segura:
- **Abordagem Adotada:** Utilizar o serviço gerenciado de envio do Firebase Auth (`sendPasswordResetEmail(auth, email)`), com template de e-mail e remetente institucional (`noreply@unispect.com.br`) configurados no console do Firebase Authentication.

### 8.2. Protocolo de Saneamento Prévio da Coleção `/usuarios`
Antes de qualquer importação para o Firebase Auth:
1. **Usuários sem E-mail ou com E-mail Fictício:** O cadastro atual contém usuários definidos apenas por login (ex: `login: 'admin'`). O administrador deve preencher previamente um e-mail corporativo válido para cada um.
2. **Duplicidades de E-mail:** O Firebase Auth exige unicidade estrita de e-mail por projeto. Casos duplicados devem ser desmembrados com e-mails individualizados.
3. **Validação de IDs:** Garantir que o UID a ser criado no Auth corresponda ao ID do Firestore (`usr_xxx`), respeitando o limite máximo de 128 caracteres ASCII.

---

## 9. Inventário Completo de Coleções, Dados e Filas para Backup

O inventário de conferência audita **16 coleções do Firestore**, além dos arquivos físicos e filas móveis:

| Coleção / Recurso | Finalidade Operacional | Métrica Auditada | Tolerância de Erro |
| :--- | :--- | :--- | :---: |
| `/clientes` | Cadastro mestre dos clientes contratantes | Total de registros | 0 |
| `/bookings` | Reservas de embarque e contêineres embutidos | Total de docs e total de contêineres | 0 |
| `/bookingImports` | Histórico imutável de romaneios em PDF importados | Total de operações | 0 |
| `/bookingNumberKeys` | Índices atômicos de unicidade de número de booking | Total de chaves ativas | 0 |
| `/bookingCounters` | Contadores sequenciais de certificados (`UNxxxx/ano`) | Valor do contador atual | 0 |
| `/containerPhotos` | Metadados e URLs de fotos de contêineres | Total de metadados | 0 |
| `/fieldContainers` | Contêineres conferidos no campo pendentes de romaneio | Total pendentes e vinculados | 0 |
| `/fieldOperations` | Registro de idempotência de envios móveis | Total de operações enviadas | 0 |
| `/fieldContainerDeletions`| Tombstones de contêineres excluídos (anti-ressurreição) | Total de tombstones | 0 |
| `/yardPassages` | Registro de passagens de contêineres pelo pátio | Total de passagens | 0 |
| `/yardActiveLocks` | Locks de exclusividade de contêiner ativo no pátio | Total de locks ativos | 0 |
| `/yardAudits` | Auditorias e conferências físicas diárias de pátio | Total de auditorias concluídas | 0 |
| `/locais` | Terminais alfandegados e armazéns | Total de recintos cadastrados | 0 |
| `/exportadores` | Empresas exportadoras donas da carga | Total de exportadores | 0 |
| `/inspectors` | Inspetores credenciados para vistorias | Total de inspetores | 0 |
| `/usuarios` | Cadastro legado de usuários (base para migração Auth) | Total de operadores cadastrados | 0 |
| **Storage (`containers/`)** | Arquivos JPEG das vistorias probatórias | Total de arquivos e bytes totais | 0 |
| **IndexedDB (`fieldQueue`)** | Fila offline local do Modo Campo nos celulares | Deve estar zerada antes do corte | 0 |
| **IndexedDB (`photoQueue`)| Fila offline local de fotos nos celulares | Deve estar zerada antes do corte | 0 |
| **LocalStorage (`yardQueue`)| Fila offline de auditorias de pátio nos celulares | Deve estar zerada antes do corte | 0 |

---

## 10. Proteção Ativa Contra Conexão Acidental do Ambiente de Testes à Produção

A variável `VITE_APP_ENV` não é suficiente para comprovar isolamento. Para evitar qualquer vazamento de testes na base de produção:

1. **Trava Fatal no Código de Inicialização (`src/firebase.js`):**
   ```javascript
   // TRAVA DE SEGURANÇA: Bloqueia execução de testes contra o banco de produção
   const isTestHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
   const isStagingEnv = import.meta.env.VITE_APP_ENV === 'staging';

   if ((isTestHost || isStagingEnv) && firebaseConfig.projectId === 'unispect-service') {
     const isEmulator = localStorage.getItem('unispect_use_emulator') === 'true';
     if (!isEmulator) {
       const msg = 'BLOQUEIO FATAL DE SEGURANÇA: Ambiente de desenvolvimento/testes apontando para a base de PRODUÇÃO da INTERPORT sem emulador ativo. Conexão abortada.';
       document.body.innerHTML = `<div style="background:#ef4444;color:#fff;padding:40px;font-family:sans-serif;font-weight:bold;">${msg}</div>`;
       throw new Error(msg);
     }
   }
   ```
2. **Travas no Nível de Rede e Testes Automatizados:**
   - Em suítes de teste Node (`node --test`), forçar variáveis de ambiente direcionando para o emulador (`FIRESTORE_EMULATOR_HOST=localhost:8080` e `FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199`).
   - Bloquear requisições externas para `googleapis.com` durante os testes automatizados.

---

## 11. Lista Objetiva das Próximas Ações

| Ação | Local de Execução | Acesso Necessário (Menor Privilégio) | Resultado Esperado | Evidência de Conclusão |
| :--- | :--- | :--- | :--- | :--- |
| **1. Extrair Regras Ativas da Produção** | Console Firebase / Nuvem | `roles/firebaserules.viewer` no GCP | Obter o texto exato das regras vigentes de Firestore e Storage. | Arquivo `firestore.rules.live.txt` arquivado em `docs/`. |
| **2. Gerar Tag Git de Marco Zero** | Terminal Local | Permissão de push na branch `master` | Ponto de restauração imutável do código v2.2.1. | Tag `backup-pre-etapa0-v2.2.1` confirmada no GitHub. |
| **3. Saneamento dos E-mails de Usuários** | Firestore / Local | `roles/datastore.user` | Todos os usuários da coleção `/usuarios` com e-mail institucional válido e sem duplicidades. | Relatório de saneamento com 100% de e-mails válidos. |
| **4. Executar Backup do Firestore** | Google Cloud CLI / Cloud Shell | `roles/datastore.importExportAdmin` no projeto e `roles/storage.objectAdmin` no bucket de backup | Snapshot completo de todas as 16 coleções. | Log de sucesso do `gcloud firestore export` com timestamp. |
| **5. Sincronizar Fotos do Storage** | Google Cloud CLI / Cloud Shell | `roles/storage.objectViewer` (origem) e `roles/storage.objectAdmin` (destino) | Cópia binária de todos os JPEGs para o bucket de backup privado. | Relatório do `gcloud storage rsync` com total de arquivos e volume em bytes. |
| **6. Restaurar Backup no Emulador Local** | Terminal Local / Máquina Dev | Firebase CLI (`firebase-tools`) | Base completa da INTERPORT rodando isolada em `localhost:8080`. | Logs do emulador com `Imported data from ...` e UI acessível offline. |
| **7. Conferência Automatizada do Inventário** | Terminal Local / Emulador | Node.js local contra emulador | Comparação das 16 coleções e contagens de fotos entre produção e emulador. | Relatório de inventário com divergência zero em todas as métricas. |
| **8. Teste de Imagens Isoladas** | Terminal Local / Emulador | Script de auditoria de buffer | Validação de leitura dos JPEGs sem bater na nuvem de produção. | 100% das fotos testadas com status 200 via `localhost:9199` e hash verificado. |

---
*Documento da Etapa 0 revisado e consolidado em `docs/etapa-0-planejamento-seguro.md`.*
