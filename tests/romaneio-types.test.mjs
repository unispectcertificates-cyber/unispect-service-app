import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContainerType, extractContainersFromText } from '../src/utils/pdfParser.js';

// Textos extraídos dos 4 Romaneios de exemplo enviados pelo usuário
const romaneio1Text = `
N° Contêiner Lacres Cod.Lote/Marca Tipo
Cntr Quant. Peso
Carga Tara
Peso
Bruto
1 CAIU-297209-2 20"/DV 0 0,000 2.200 2.200,00
2 DFSU-274347-8 20"/DV 0 0,000 2.185 2.185,00
3 WEDU-270510-0 20"/DV 0 0,000 2.280 2.280,00
4 WEDU-279666-7 20"/DV 0 0,000 2.280 2.280,00
5 WEDU-386557-2 20"/DV 0 0,000 2.280 2.280,00
6 WEDU-669922-2 20"/DV 0 0,000 2.220 2.220,00
7 WEDU-682812-4 20"/DV 0 0,000 2.215 2.215,00
8 WEDU-687709-4 20"/DV 0 0,000 2.215 2.215,00
9 WSCU-632426-1 20"/DV 0 0,000 2.280 2.280,00
Totais: 0 0,000 20.155 20.155,00
Booking...: 70018671 
Navio.....: LOG-IN PANTANAL
Viagem....: 621S
Exportador: BRASCOF LTDA
CNPJ Exportador: 54628906000265
Mercadoria: CAFE CON 0037/26-1
Armador...: CARU
Recinto...: INTERPORT LOGISTICA LTDA
`;

const romaneio2Text = `
N° Contêiner Lacres Cod.Lote/Marca Tipo
Cntr Quant. Peso
Carga Tara
Peso
Bruto
1 CARU-999585-6 40"/HC 0 0,000 3.840 3.840,00
2 WEDU-886358-8 40"/HC 0 0,000 3.840 3.840,00
3 WEDU-896422-2 40"/HC 0 0,000 3.940 3.940,00
Totais: 0 0,000 11.620 11.620,00
Booking...: 70018672 
Navio.....: LOG-IN PANTANAL
Viagem....: 621S
Exportador: BRASCOF LTDA
CNPJ Exportador: 54628906000265
Mercadoria: CAFE CON -0037/26-2
Armador...: CARU
Recinto...: INTERPORT LOGISTICA LTDA
`;

const romaneio3Text = `
 ROMANEIO 19/10/2026 10:17
 Booking...: 277337344
 Navio.....: LOG-IN PANTANAL
 Viagem....: 619S
 Importador: ALDOHA FOR FOOD INDUSTRIES
 Exportador: SACCONI AGROINDUSTRIAL COMERCIO E EXPORTACAO LTDA
 CNPJ Exportador: 04642939000100
 Destino...: EGITO
 Quantidade: 540
 Embalagem.: Sacaria
 Mercadoria: PIMENTA
 Referencia: 418-SP/26 B - SCC 146/26
 Armador...: MAERSK BRASIL BRASMAR LTDA
 Recinto...: Interport Logistica Ltda
 N° Container Lacres Cod. Lote/Marca Tipo
Cntr
 Quant. Peso
Carga
 Tara Peso
Bruto
 1 CAAU7850432 MLBR0681891
40"45G1
 540 27000 3700 30700
 Totais: 540 27000 3700 30700
 Observação: FATURAR PRÉ STACKING DIA 21/10. CONTÉM FITO DIA 22/10.
`;

const romaneio4Text = `
 ROMANEIO 19/10/2026 10:07
 Booking...: 241ISZ2618351
 Navio.....: LOG-IN DISCOVERY
 Viagem....: 744S
 Importador: NESTLE SOUTH AFRICA
 Exportador: ED&F MAN VOLCAFE BRASIL LTDA
 CNPJ Exportador: 33729690003350
 Destino...: DURBAN - AFRICA DO SUL
 Quantidade: 20
 Embalagem.: ALPHA BAG
 Mercadoria: CAFÉ
 Referencia: S84059.000
 Armador...: MSC MEDITERRANEAN SHIPPING DO BRASIL LTDA
 Recinto...: Interport Logistica Ltda
 N° Container Lacres Cod. Lote/Marca Tipo
Cntr
 Quant. Peso
Carga
 Tara Peso
Bruto
 1 HPCU2324405 005983
005962
 002/1643/1917
20"22G1
 20 20000 2220 22220
 Totais: 20 20000 2220 22220
 Observação: FATURAR PRÉ STACKING DIA 20/10. | CONTÉM FITO DIA 20/10.
`;

test('1. Normalização de Tipo Cntr: converte formatos conforme especificação', () => {
  // 20"/DV
  assert.equal(normalizeContainerType('20"/DV'), '20"/DV');
  assert.equal(normalizeContainerType('20/DV'), '20"/DV');
  assert.equal(normalizeContainerType('20" DV'), '20"/DV');
  assert.equal(normalizeContainerType('20 DV'), '20"/DV');
  assert.equal(normalizeContainerType("20' Dry"), '20"/DV');

  // 20"22G1
  assert.equal(normalizeContainerType('20"22G1'), '20"22G1');
  assert.equal(normalizeContainerType('20" 22G1'), '20"22G1');
  assert.equal(normalizeContainerType('22G1'), '20"22G1');
  assert.equal(normalizeContainerType('20/22G1'), '20"22G1');

  // 40"/HC
  assert.equal(normalizeContainerType('40"/HC'), '40"/HC');
  assert.equal(normalizeContainerType('40/HC'), '40"/HC');
  assert.equal(normalizeContainerType('40" HC'), '40"/HC');
  assert.equal(normalizeContainerType('40 HC'), '40"/HC');
  assert.equal(normalizeContainerType("40' HC"), '40"/HC');

  // 40"45G1
  assert.equal(normalizeContainerType('40"45G1'), '40"45G1');
  assert.equal(normalizeContainerType('40" 45G1'), '40"45G1');
  assert.equal(normalizeContainerType('45G1'), '40"45G1');
  assert.equal(normalizeContainerType('40/45G1'), '40"45G1');
});

test('2. Romaneio 1 (70018671): extrai Tipo Cntr 20"/DV para todos os containers', () => {
  const containers = extractContainersFromText(romaneio1Text);
  assert.equal(containers.length, 9);
  for (const c of containers) {
    assert.equal(c.containerType, '20"/DV', `Container ${c.containerNumber} deve ter Tipo Cntr 20"/DV`);
  }
  assert.equal(containers[0].containerNumber, 'CAIU2972092');
  assert.equal(containers[0].tara, '2200');
  assert.equal(containers[1].containerNumber, 'DFSU2743478');
  assert.equal(containers[1].tara, '2185');
});

test('3. Romaneio 2 (70018672): extrai Tipo Cntr 40"/HC para todos os containers', () => {
  const containers = extractContainersFromText(romaneio2Text);
  assert.equal(containers.length, 3);
  for (const c of containers) {
    assert.equal(c.containerType, '40"/HC', `Container ${c.containerNumber} deve ter Tipo Cntr 40"/HC`);
  }
  assert.equal(containers[0].containerNumber, 'CARU9995856');
  assert.equal(containers[0].tara, '3840');
  assert.equal(containers[2].containerNumber, 'WEDU8964222');
  assert.equal(containers[2].tara, '3940');
});

test('4. Romaneio 3 (277337344): extrai Tipo Cntr 40"45G1 e campos associados', () => {
  const containers = extractContainersFromText(romaneio3Text);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].containerNumber, 'CAAU7850432');
  assert.equal(containers[0].containerType, '40"45G1');
  assert.equal(containers[0].definiteSeal, 'MLBR0681891');
  assert.equal(containers[0].bagsQuantity, 540);
  assert.equal(containers[0].netWeight, '27000');
  assert.equal(containers[0].tara, '3700');
  assert.equal(containers[0].grossWeight, '30700');
});

test('5. Romaneio 4 (241ISZ2618351): extrai Tipo Cntr 20"22G1 e múltiplos lacres', () => {
  const containers = extractContainersFromText(romaneio4Text);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].containerNumber, 'HPCU2324405');
  assert.equal(containers[0].containerType, '20"22G1');
  assert.equal(containers[0].definiteSeal, '005983');
  assert.equal(containers[0].provisionalSeals.length, 1);
  assert.equal(containers[0].provisionalSeals[0].sealNumber, '005962');
  assert.equal(containers[0].brand, '002/1643/1917');
  assert.equal(containers[0].bagsQuantity, 20);
  assert.equal(containers[0].netWeight, '20000');
  assert.equal(containers[0].tara, '2220');
  assert.equal(containers[0].grossWeight, '22220');
});
