# UNISPECT — Container sem Booking no Modo Campo

## Fluxo implementado

Na tela principal do Modo Campo, o administrador ou inspetor encontra o botão
**Inserir container sem Booking**. O botão é exibido em telas de até 1024 px e
em aparelhos com toque de até 1366 px, para atender celular/tablet em paisagem.
Não aparece na tela administrativa de desktop.

O inspetor informa número do container, tara em kg, tipo de lacre (definitivo
ou provisório) e número do lacre. Todos esses campos e pelo menos uma nova foto
são obrigatórios, conforme solicitado. Pode tirar fotos pela câmera ou selecionar
na galeria.

O botão Salvar confirma uma transação local contendo cadastro, fila e arquivos
das fotos. Só depois dessa confirmação o aplicativo retorna à tela principal.
Não aguarda rede, compressão, Firebase nem upload. Se a gravação falhar, mantém
a tela e as fotos abertas, sem informar sucesso.

Digitar novamente o número abre o mesmo cadastro. Os valores anteriores ficam
preenchidos e protegidos, e as novas fotos são acrescentadas às anteriores.
Espaços, hífens e diferenças de maiúsculas não criam outro container.

## Envio automático

O envio começa imediatamente depois do salvamento local. Fotos são preparadas
para JPEG de até 1600 px, qualidade 0,8, somente durante o envio. Há no máximo
duas fotos sendo enviadas ao mesmo tempo por operação.

Sem sinal, os dados e arquivos continuam na fila IndexedDB do aparelho. O envio
é retomado quando o navegador informa que a internet voltou, quando o aplicativo
volta ao primeiro plano e a cada 30 segundos para recuperar falhas de conexão.
Também existe “Tentar enviar agora”.

O aplicativo mostra containers/fotos aguardando envio e eventuais erros.
Não confundir “salvo no aparelho” com “enviado”: o desktop só consegue consultar
os dados que chegaram ao Firebase.

IDs estáveis de foto e operação, caminho de arquivo estável e marcadores de
operação concluída evitam duplicações quando uma tentativa é repetida. Os arquivos
locais são liberados apenas depois da confirmação da gravação remota. A confirmação
de uma operação não apaga fotos de outras operações do mesmo container.

Quando dois aparelhos cadastram offline o mesmo número, podem existir duas filas
locais temporárias. Ao enviar, ambos usam um único documento remoto por número,
preservando as fotos dos dois. O primeiro cadastro remoto mantém seus valores;
os valores apresentados em cada envio ficam registrados em `fieldOperations`.

O navegador pode suspender o envio quando o aplicativo for fechado. Nesse caso,
ele retoma ao reabrir. Esta implementação não promete execução com o aplicativo
encerrado pelo Android/iOS. O aparelho precisa abrir o aplicativo conectado pelo
menos uma vez e manter o login para que a interface esteja disponível offline.

## Vinculação no desktop

Os fluxos existentes de cadastro e atualização de romaneio foram mantidos,
incluindo o botão de atualização e as alterações de cabeçalho introduzidas pelo
Antigravity na versão enviada.

Ao confirmar um romaneio, a mesma transação do Booking lê os registros pendentes
dos números reconhecidos. Vincula dados e fotos e marca o registro como `linked`.
Ele desaparece da lista de containers sem Booking. Não é apagado: seu vínculo
é mantido para receber fotos adicionais e para rastreabilidade.

Em um container novo, o ID do cadastro de campo é preservado e tara/lacre medidos
no campo têm prioridade sobre valores extraídos do PDF. Em um container que já
existe no Booking, o ID e as informações anteriores são preservados. Fotos são
acrescentadas, campos vazios podem ser preenchidos e divergências de tara/lacre
ficam disponíveis na informação da conferência de campo para revisão.

Não há cópia dos arquivos de fotos. Muda o vínculo; as URLs e o caminho no Storage
continuam os mesmos. A busca de fotos considera a identidade de origem quando o
container do Booking já possuía outro ID.

Também são tratados os dois casos de atraso:

- O romaneio chega enquanto as fotos estão sendo enviadas: o envio termina no
  Booking que recebeu o registro.
- O romaneio já foi cadastrado quando um aparelho offline consegue enviar:
  a sincronização encontra o container no Booking ativo e faz o vínculo.

Se houver mais de um Booking ativo com esse número, a associação automática
é bloqueada para revisão. Não escolhe arbitrariamente. Um registro já vinculado
a um Booking finalizado não é reutilizado automaticamente em outra operação;
esse caso exige revisão administrativa para evitar misturar fotos de operações.

## Arquivos

- `src/components/FieldCapturePanel.jsx`: botão, cadastro, fotos e fila no Modo Campo.
- `src/components/FieldCaptureNotice.jsx`: origem da conferência e divergências.
- `src/utils/fieldQueue.js`: transações locais e motor de envio com retentativa.
- `src/utils/fieldService.js`: integração Firebase, preparo das fotos e retomada.
- `src/utils/fieldContainers.js`: unicidade, associação e persistência remota.
- `src/utils/containerIdentity.js`: normalização compartilhada de containers.
- `src/utils/bookingImport.js`: vínculo de registros de campo durante a importação.
- `src/db.js`: busca pelas fotos de origem e limpeza da referência de fotos excluídas.
- `src/components/MobileAppView.jsx`: entrada e execução da sincronização.
- `src/mobile/main-mobile.jsx`: registro do service worker também na entrada mobile.
- `alteracoes-modo-campo.patch`: diferenças em relação ao RAR enviado nesta solicitação.

Os arquivos `vite.config.js` e `eslint.config.js`, ausentes do RAR, foram lidos
da pasta atual do projeto no computador. A pasta original e o RAR não foram alterados.

## Validação realizada

- 34 testes Node passaram: importação incremental anterior, requisitos de cadastro,
  unicidade, dois inspetores, vínculo em romaneio novo/existente, envio atrasado,
  falhas e atomicidade, reenvio sem duplicar, preservação de fotos e exclusão.
- IndexedDB real no Chrome: gravação de blobs, persistência ao recarregar e abrir
  outra página, gravações simultâneas, operação abortada, confirmação parcial da
  fila e manutenção dos dados após falha de envio.
- Interface no Chrome: botão no celular e oculto no desktop, campos obrigatórios,
  entrada de câmera, retorno à tela principal e fotos adicionais no mesmo cadastro.
- Compilação de produção e verificação estática dos módulos novos passaram.

Em execuções locais no computador, gravar 20 arquivos de 1 MB levou aproximadamente
133–146 ms. O teste de interface retornou à tela principal em aproximadamente
71–81 ms para uma foto de teste pequena. Isso não é uma promessa de desempenho
em aparelhos reais. Os testes de armazenamento usam blobs sintéticos e o teste de
interface usa uma imagem pequena. Teste fotos reais da câmera antes de publicar.

Os testes de comportamento remoto usam um adaptador transacional em memória,
com repetição em conflitos e confirmação atômica. Os testes de navegador usam
respostas locais simuladas, sem acessar a produção. Nenhuma operação foi executada
no Firebase real ou no emulador oficial. Não foi gerado um novo APK.

## Integração pelo Antigravity

1. Fazer backup e extrair o ZIP em uma pasta separada.
2. Ler este documento e comparar `alteracoes-modo-campo.patch` com o projeto atual.
3. Integrar as alterações, preservando mudanças posteriores ao RAR.
4. Instalar as dependências com `npm ci`, executar `npm test` e `npm run build`.
5. Revisar as regras Firestore/Storage já utilizadas, usando homologação.
6. Testar em celular/tablet real, com fotografias reais, perda de sinal e retomada.
7. Confirmar o vínculo ao cadastrar e ao atualizar um romaneio no desktop.
8. Apresentar os resultados antes de publicar ou substituir o aplicativo da equipe.

As dependências já disponíveis no computador foram usadas na validação de build:
Vite 8.0.14 e Firebase 12.14.0. O manifesto e o lockfile recebidos foram mantidos,
com alteração dos scripts de teste no manifesto. Uma instalação limpa precisa
ser validada no ambiente de integração.

## Permissões necessárias e limites

As regras Firebase não foram incluídas no RAR. Não foram criadas regras públicas
nem alteradas as permissões em produção. O responsável precisa integrar as novas
coleções à autorização já adotada pelo sistema:

- `fieldContainers/{NUMERO_NORMALIZADO}`: cadastro único pendente e vínculo.
- `fieldOperations/{ID_OPERACAO}`: confirmação idempotente e histórico de envios.
- `containerPhotos/{ID_FOTO}`: metadados existentes, agora também com `fieldNumber`.
- `bookings`: leitura e atualização transacional para vincular e acrescentar fotos.
- `bookingImports`, `bookingNumberKeys`, `bookingCounters`: já utilizadas na importação.
- Storage: envio em `containers/{ID_ORIGEM}/{ID_FOTO}.jpg`.

Autorizações reais devem ser garantidas por regras/servidor; o papel salvo no
navegador não substitui autenticação no Firebase. Não autorize todas as coleções
publicamente para fazer o fluxo funcionar. Clientes antigos que não utilizam
revisões e chaves podem ignorar as proteções; atualize os clientes em conjunto.

A transação de importação agora precisa ler `fieldContainers` mesmo quando não
houver um cadastro para aquele número. Uma negativa de permissão bloqueia a
confirmação inteira em vez de importar ignorando as fotos de campo.

Não limpe os dados do aplicativo/navegador nem desinstale enquanto houver envios
pendentes: isso pode apagar o armazenamento local. O aplicativo solicita proteção
contra remoção automática do armazenamento, mas a concessão depende do navegador.
Fotos já confirmadas no Firebase ficam disponíveis pela nuvem; não são mantidas
indefinidamente em cópia local. O registro mostra erro quando faltar espaço.

O formato validado é quatro letras e sete dígitos; não foi acrescentada validação
do dígito ISO. A leitura de PDFs mantém o extrator existente e não inclui OCR.
Nenhum romaneio real acompanhou este RAR.

Referências técnicas:

- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- https://firebase.google.com/docs/firestore/manage-data/transactions
