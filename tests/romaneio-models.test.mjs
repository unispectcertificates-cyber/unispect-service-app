import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContainersFromText } from '../src/utils/pdfParser.js';
import { createBookingRepository, planImport, previewToken } from '../src/utils/bookingImport.js';

// Textos representativos dos dois modelos de romaneio enviados pelo usuário
const romaneioModelo1Text = `
INTERPORT LOGISTICA LTDA
Romaneio 20/10/2026 Página: 1
Booking...: EBKG18806364 
Navio.....: LOG-IN DISCOVERY
Viagem....: 744S
Importador: ERKA ITHALAT IHRACATVE TIC.LTD
Exportador: UNICAFE COMPANHIA DE COMERCIO EXTERIOR
CNPJ Exportador: 28154680000117
Destino...: TR/MERSIN
Quantidade: 2.640 SACA
Mercadoria: CAFÉ - IE-0920 / PE41021A
Marca.....: 
Armador...: MSC
Agente....: ** Não informado
Recinto...: 
N° Contêiner Lacres Cod.Lote/Marca Tipo Cntr Quant. Peso Carga Tara Peso Bruto
1 BEAU-571917-0 FJ27080166
1168
 02/3425/0036 40"/HC 440 26.620,000 3.700 30.320,00
2 CAIU-726918-5 FJ27080187
1163
 02/3425/0036 40"/HC 440 26.620,000 3.700 30.320,00
3 MEDU-773686-6 FJ27080179
1166
 02/3425/0036 40"/HC 440 26.620,000 3.840 30.460,00
4 MEDU-776947-4 FJ27080178
1164
 02/3425/0036 40"/HC 440 26.620,000 3.840 30.460,00
5 MSCU-539295-5 FJ27080176
1165
 02/3425/0036 40"/HC 440 26.620,000 3.840 30.460,00
6 TRHU-770458-8 FJ27080180
1167
 02/3425/0036 40"/HC 440 26.620,000 3.700 30.320,00
Totais: 2.640 159.720,000 22.620 182.340,00
RETIRADA DE 06X40HC NO DEPOT MEDLOG DIA 20/10.
ESTUFAGEM NO ARMAZÉM ALVORADA DIA 21/10.
CONTÉM FUMIGAÇÃO DIA 21/10
VENTILAÇÃO DIA 25/10.
CONTÉM FITO DIA 26/10.
INTERPORT LOGISTICA LTDA
`;

const romaneioModelo2Text = `
 ROMANEIO 20/10/2026 15:21
 Booking...: EBKG19041356
 Navio.....: LOG-IN DISCOVERY
 Viagem....: 744S
 Importador: ROYAL GOLDEN EXPORTS FZ LLC
 Exportador: SACCONI AGROINDUSTRIAL COMERCIO E
EXPORTACAO LTDA
 CNPJ Exportador: 04642939000100
 Destino...: AQABA
 Quantidade: 1080
 Embalagem.: Sacaria
 Mercadoria: PIMENTA
 Referencia: RGE-26-P211 - SCC 143/26
 Armador...: MSC MEDITERRANEAN
SHIPPING DO BRASIL LTDA
 Recinto...: Interport Logistica Ltda
 N° Container Lacres Cod. Lote/Marca Tipo
Cntr
 Quant. Peso
Carga
 Tara Peso
Bruto
 1 CXDU1159071 FJ27079722
40"45G1
 1080 27000 3900 30900
 Totais: 1080 27000 3900 30900
 Observação: FATURAR PRÉ STACKING DIA 22/10. | CONTÉM FITO DIA 22/10.
Powered by TCPDF (www.tcpdf.org)
`;

function createMemoryRepo(initialBookings = []) {
  const data = new Map(initialBookings.map(b => [`bookings/${b.id}`, structuredClone(b)]));
  let serial = 0;
  return {
    data,
    repo: createBookingRepository({
      listBookings: async () => [...data.values()].map(b => structuredClone(b)),
      reference: (col, id) => `${col}/${id}`,
      newId: p => `${p}_${++serial}`,
      now: () => Date.now(),
      transaction: async fn => fn({
        get: async k => ({ exists: () => data.has(k), data: () => structuredClone(data.get(k)) }),
        set: (k, v) => data.set(k, structuredClone(v)),
        update: (k, v) => data.set(k, { ...structuredClone(data.get(k)), ...structuredClone(v) }),
        delete: k => data.delete(k)
      })
    })
  };
}

test('1. Romaneio Modelo 1: extrai todos os 6 containers com ambos os lacres (ex: FJ27080166 / 1168)', () => {
  const containers = extractContainersFromText(romaneioModelo1Text);
  assert.equal(containers.length, 6);

  // Container 1
  assert.equal(containers[0].containerNumber, 'BEAU5719170');
  assert.equal(containers[0].definiteSeal, 'FJ27080166 / 1168');
  assert.equal(containers[0].brand, '02/3425/0036');
  assert.equal(containers[0].containerType, '40"/HC');
  assert.equal(containers[0].bagsQuantity, 440);
  assert.equal(containers[0].netWeight, '26.620,000');
  assert.equal(containers[0].tara, '3700');
  assert.equal(containers[0].grossWeight, '30.320,00');

  // Container 2
  assert.equal(containers[1].containerNumber, 'CAIU7269185');
  assert.equal(containers[1].definiteSeal, 'FJ27080187 / 1163');
  assert.equal(containers[1].tara, '3700');

  // Container 3
  assert.equal(containers[2].containerNumber, 'MEDU7736866');
  assert.equal(containers[2].definiteSeal, 'FJ27080179 / 1166');
  assert.equal(containers[2].tara, '3840');

  // Container 4
  assert.equal(containers[3].containerNumber, 'MEDU7769474');
  assert.equal(containers[3].definiteSeal, 'FJ27080178 / 1164');
  assert.equal(containers[3].tara, '3840');

  // Container 5
  assert.equal(containers[4].containerNumber, 'MSCU5392955');
  assert.equal(containers[4].definiteSeal, 'FJ27080176 / 1165');
  assert.equal(containers[4].tara, '3840');

  // Container 6
  assert.equal(containers[5].containerNumber, 'TRHU7704588');
  assert.equal(containers[5].definiteSeal, 'FJ27080180 / 1167');
  assert.equal(containers[5].tara, '3700');
});

test('2. Romaneio Modelo 2 (TCPDF): extrai container, tipo 40"45G1, lacre alfanumérico e pesos', () => {
  const containers = extractContainersFromText(romaneioModelo2Text);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].containerNumber, 'CXDU1159071');
  assert.equal(containers[0].definiteSeal, 'FJ27079722');
  assert.equal(containers[0].containerType, '40"45G1');
  assert.equal(containers[0].bagsQuantity, 1080);
  assert.equal(containers[0].netWeight, '27000');
  assert.equal(containers[0].tara, '3900');
  assert.equal(containers[0].grossWeight, '30900');
});

test('3. Push do Lacre Romaneio para Lacre Definitivo no Modelo 1: atualiza containers existentes e preserva fotos', async () => {
  // Booking existente com 6 containers cadastrados anteriormente sem lacres e com fotos
  const existingContainers = [
    { id: 'c1', containerNumber: 'BEAU5719170', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3700', photos: [{ id: 'ph1', url: 'f1.jpg' }] },
    { id: 'c2', containerNumber: 'CAIU7269185', definiteSeal: 'SEAL_ANTIGO', netWeight: '', grossWeight: '', tara: '3700', photos: [{ id: 'ph2', url: 'f2.jpg' }] },
    { id: 'c3', containerNumber: 'MEDU7736866', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3840', photos: [] },
    { id: 'c4', containerNumber: 'MEDU7769474', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3840', photos: [] },
    { id: 'c5', containerNumber: 'MSCU5392955', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3840', photos: [] },
    { id: 'c6', containerNumber: 'TRHU7704588', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3700', photos: [] }
  ];

  const currentBooking = {
    id: 'b_ebkg18806364',
    bookingNumber: 'EBKG18806364',
    exporterId: 'exp1',
    locationId: 'loc1',
    containers: existingContainers,
    _revision: 1
  };

  const { repo, data } = createMemoryRepo([currentBooking]);

  const parsedContainers = extractContainersFromText(romaneioModelo1Text);
  const incoming = {
    ...currentBooking,
    bagsQuantity: 2640,
    containers: parsedContainers
  };

  const plan = planImport(currentBooking, incoming.containers);
  assert.equal(plan.added.length, 0);
  assert.equal(plan.preserved.length, 6);

  const result = await repo.importBooking(incoming, {
    expectedPreview: previewToken(currentBooking, plan),
    sourceName: 'romaneio_m1.pdf'
  });

  assert.equal(result.updatedContainersCount, 6);
  assert.equal(result.booking.containers.length, 6);

  // Verifica que todos os lacres do romaneio foram enviados (Push) para os Lacres Definitivos
  assert.equal(result.booking.containers[0].definiteSeal, 'FJ27080166 / 1168');
  assert.equal(result.booking.containers[0].netWeight, '26.620,000');
  assert.equal(result.booking.containers[0].grossWeight, '30.320,00');
  assert.deepEqual(result.booking.containers[0].photos, [{ id: 'ph1', url: 'f1.jpg' }]);

  assert.equal(result.booking.containers[1].definiteSeal, 'FJ27080187 / 1163');
  assert.deepEqual(result.booking.containers[1].photos, [{ id: 'ph2', url: 'f2.jpg' }]);

  assert.equal(result.booking.containers[2].definiteSeal, 'FJ27080179 / 1166');
  assert.equal(result.booking.containers[3].definiteSeal, 'FJ27080178 / 1164');
  assert.equal(result.booking.containers[4].definiteSeal, 'FJ27080176 / 1165');
  assert.equal(result.booking.containers[5].definiteSeal, 'FJ27080180 / 1167');
});

test('4. Push do Lacre Romaneio para Lacre Definitivo no Modelo 2: atualiza container CXDU1159071', async () => {
  const existingContainers = [
    { id: 'c1', containerNumber: 'CXDU1159071', definiteSeal: '', netWeight: '', grossWeight: '', tara: '3900', photos: [{ id: 'ph_cx', url: 'cx.jpg' }] }
  ];

  const currentBooking = {
    id: 'b_ebkg19041356',
    bookingNumber: 'EBKG19041356',
    exporterId: 'exp2',
    locationId: 'loc2',
    containers: existingContainers,
    _revision: 1
  };

  const { repo } = createMemoryRepo([currentBooking]);

  const parsedContainers = extractContainersFromText(romaneioModelo2Text);
  const incoming = {
    ...currentBooking,
    bagsQuantity: 1080,
    containers: parsedContainers
  };

  const plan = planImport(currentBooking, incoming.containers);
  assert.equal(plan.added.length, 0);
  assert.equal(plan.preserved.length, 1);

  const result = await repo.importBooking(incoming, {
    expectedPreview: previewToken(currentBooking, plan),
    sourceName: 'romaneio_m2.pdf'
  });

  assert.equal(result.updatedContainersCount, 1);
  assert.equal(result.booking.containers[0].definiteSeal, 'FJ27079722');
  assert.equal(result.booking.containers[0].netWeight, '27000');
  assert.equal(result.booking.containers[0].grossWeight, '30900');
  assert.equal(result.booking.containers[0].containerType, '40"45G1');
  assert.deepEqual(result.booking.containers[0].photos, [{ id: 'ph_cx', url: 'cx.jpg' }]);
});
