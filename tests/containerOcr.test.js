import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIso6346CheckDigit,
  formatContainerNumber,
  extractContainerInfoFromText
} from '../src/utils/containerOcr.js';

describe('containerOcr - Reconhecimento e extração de identificação de containers', () => {
  it('valida corretamente dígitos verificadores ISO 6346', () => {
    // Containers ISO válidos conhecidos
    assert.equal(validateIso6346CheckDigit('CSQU3054383'), true);
    assert.equal(validateIso6346CheckDigit('csqu 305438-3'), true);
    // Dígito verificador incorreto
    assert.equal(validateIso6346CheckDigit('CSQU3054389'), false);
    // Tamanho incorreto
    assert.equal(validateIso6346CheckDigit('CSQU30543'), false);
  });

  it('formata número para apresentação amigável ABCD 123456-7', () => {
    assert.equal(formatContainerNumber('MSDU8821297'), 'MSDU 882129-7');
    assert.equal(formatContainerNumber('msdu-882129-7'), 'MSDU 882129-7');
  });

  it('extrai número de container e tara de texto com espaçamentos e pontuações', () => {
    const rawOcr = `
      LINE SHIPPING SERVICES
      CONTAINER NO. MSDU 882129-7
      MAX. GROSS 30480 KG
      TARE 3.820 KG
      PAYLOAD 26660 KG
    `;
    const result = extractContainerInfoFromText(rawOcr);
    assert.equal(result.containerNumber, 'MSDU8821297');
    assert.equal(result.formattedNumber, 'MSDU 882129-7');
    assert.equal(result.tara, '3820');
  });

  it('corrige confusões comuns de OCR (O por 0, I por 1)', () => {
    const rawOcr = 'CXRU 123O56-7 TARA: 3800 KG';
    const result = extractContainerInfoFromText(rawOcr);
    assert.equal(result.containerNumber, 'CXRU1230567');
    assert.equal(result.tara, '3800');
  });

  it('reconhece identificação em linhas separadas (vertical)', () => {
    const rawOcr = "MSDU\n882129\n7\nTARE 3900 KG";
    const result = extractContainerInfoFromText(rawOcr);
    assert.equal(result.containerNumber, 'MSDU8821297');
    assert.equal(result.tara, '3900');
  });

  it('retorna vazio sem lançar erro quando nenhum container for encontrado', () => {
    const result = extractContainerInfoFromText('FOTO SEM TEXTO OU IDENTIFICACAO');
    assert.equal(result.containerNumber, '');
    assert.equal(result.tara, '');
    assert.equal(result.confidence, 0);
  });
});
