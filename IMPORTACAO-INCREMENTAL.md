# UNISPECT — Importação incremental de romaneios

## O que foi implementado

A leitura do PDF continua quando o Booking já existe. A prévia compara containers
normalizados, mostra novos, existentes, repetições e divergências. Ao confirmar,
o sistema acrescenta apenas os novos. Os containers ausentes do arquivo continuam
no cadastro. Fotos, IDs, inspeções, status, observações e demais campos existentes
não são substituídos pelo romaneio.

O mesmo formulário também cadastra Bookings novos. O título agora é
“Importar Romaneio / Cadastrar Booking”. Para atualizar um Booking, use a opção
de cadastro/importação já existente na área administrativa e selecione o PDF
atualizado. Confira a prévia e clique em “Confirmar atualização”. Os outros campos
do formulário não alteram um Booking existente.

O botão “Histórico de importações” no gerenciamento do Booking mostra operações
concluídas, usuário, arquivo, quantidades e containers inseridos. Importações sem
novos containers também ficam no histórico, sem modificar o cadastro.

## Proteção da gravação

Booking, chave de unicidade, histórico, contador de certificado e novos cadastros
de exportador/recinto selecionados são gravados em uma transação Firestore.
A leitura do PDF não grava exportadores nem recintos: cadastros identificados
como novos são rascunhos até a confirmação de um Booking novo.

Cada confirmação relê o Booking e valida novamente a prévia. Se o resultado
mudar enquanto o operador revisa, a confirmação é bloqueada para nova revisão.
Falhas não deixam uma importação parcial. A operação exige conexão; não é enfileirada
para execução posterior quando estiver offline.

Todos os caminhos de gravação deste código compartilham uma chave de unicidade
e uma revisão do Booking. Uma edição antiga é recusada em vez de sobrescrever
containers importados por outro operador. Nesse caso, reabra o Booking e refaça
a edição com os dados atualizados. No modo campo, o aplicativo mostra esse erro.

Números de Booking ignoram maiúsculas/minúsculas, espaços, hífens, pontos e barras.
Containers ignoram maiúsculas/minúsculas, espaços e hífens. Não há substituição
automática entre letras e dígitos. Containers importados precisam ter quatro
letras e sete dígitos. Esta validação verifica o formato; não verifica o dígito
calculado ISO. O número original reconhecido é guardado nos containers novos.

## Arquivos principais

- `src/utils/bookingImport.js`: comparação, prévia e persistência transacional.
- `src/db.js`: integração Firebase e proteção dos demais caminhos de gravação.
- `src/App.jsx`: importação, prévia, confirmação e rascunhos de cadastros relacionados.
- `src/components/BookingImportHistory.jsx`: consulta do histórico.
- `src/components/BookingManagementModal.jsx`: acesso ao histórico.
- `src/components/MobileAppView.jsx`: aviso quando uma edição antiga é recusada.
- `tests/bookingImport.test.js`: testes do comportamento e das transações simuladas.

## Validação realizada

17 testes automatizados passaram. Eles cobrem 3 existentes + 10 novos, preservação
integral dos objetos anteriores e suas referências de fotos, containers ausentes,
normalização, repetições, inválidos, divergências, reimportação, histórico,
reversão de falhas, criação e atualização concorrentes, edição antiga, exclusão
intencional com dados atuais, renomeação e cadastros relacionados.

As transações nos testes usam um adaptador em memória que verifica a ordem de
leituras/escritas, atomicidade e repetição em conflitos. Não são testes em um
servidor Firebase real nem no emulador oficial.

A compilação de produção foi validada com as dependências já instaladas no
computador, incluindo Vite 8.0.14 e Firebase 12.14.0. O pacote mantém o manifesto
e o arquivo de dependências enviados; uma instalação nova deve ser validada com
`npm ci`. Os dois módulos novos passaram na verificação estática com ESLint.
O projeto inteiro não foi declarado livre de problemas antigos de lint.

O RAR não continha `index.html`, `mobile.html` e `eslint.config.js`; foram recuperados
da pasta local `Documentos/Documento IA Google Antigravity`. O código original
dessa pasta não foi alterado. O arquivo RAR também permaneceu intacto.

## Como validar antes de publicar

1. Instalar as dependências em uma cópia do projeto: `npm ci`.
2. Executar os testes: `npm test`.
3. Compilar: `npm run build`.
4. Usar um ambiente Firebase de homologação e conferir suas regras atuais.
5. Criar um Booking com 3 containers, anexar fotos e preencher uma inspeção.
6. Importar um PDF com os 3 existentes e 10 novos; verificar a prévia e confirmar.
7. Conferir os 13 containers, os mesmos IDs/fotos/inspeção dos 3 antigos e o histórico.
8. Reimportar o mesmo PDF: devem aparecer zero novos e nenhum dado deve mudar.
9. Testar dois operadores e uma edição aberta antes da importação.
10. Testar falha de conexão e um PDF real utilizado pela equipe.

## Pendências para uso no sistema real

As regras de segurança do Firestore não foram fornecidas. A integração precisa
permitir, conforme a autorização já adotada pelo projeto, as coleções `bookings`,
`bookingNumberKeys`, `bookingCounters` e `bookingImports`, além das coleções de
exportadores/locais quando um cadastro novo for confirmado. Não foram criadas
regras permissivas nem modificadas permissões do projeto real.

As chaves de Bookings antigos são registradas conforme eles são importados ou
salvos. Se já houver dois Bookings equivalentes, a importação é bloqueada para
revisão, sem tentar juntá-los automaticamente. Duplicidades históricas de
containers também não são apagadas automaticamente.

A proteção contra concorrência cobre clientes que utilizam este código. Versões
antigas podem continuar gravando documentos sem a chave ou a revisão. Atualize
os clientes e revise a aplicação dessas invariantes nas regras/servidor antes
de considerar a unicidade garantida para qualquer cliente.

Não foi enviado um romaneio de exemplo. O extrator PDF existente foi mantido,
com a interrupção por Booking repetido removida e com repetições disponíveis
para a prévia. PDFs digitalizados sem texto exigem OCR, que não foi implementado.
Um número que o extrator não reconhece não chega à validação; por isso é necessário
conferir a prévia com um PDF real. Falhas são exibidas e registradas no console;
somente operações concluídas possuem histórico persistente nesta implementação.

Este pacote entrega o código do aplicativo web/PWA atualizado. Nenhum Firebase
de produção foi acessado, nenhuma publicação foi feita e nenhum APK novo foi
gerado. O pacote enviado continha APK/AAB e arquivos de assinatura, mas não um
projeto Android compilável. A atualização Android depende da forma de hospedagem
e empacotamento utilizada pelo responsável pelo aplicativo.

Não foram incluídos APKs antigos, arquivos de assinatura, fotos de usuários ou
dependências instaladas no ZIP de código atualizado.

Referência da semântica transacional utilizada:
https://firebase.google.com/docs/firestore/manage-data/transactions
