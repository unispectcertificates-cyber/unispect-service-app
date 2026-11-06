import React from 'react';
import { COFFEE_OFFICIAL_SCREENS, COFFEE_OFFICIAL_DEFECT_ROWS } from '../utils/coffeeAnalysisService.js';

/**
 * Componente oficial do Certificado A4 Azul Unispect ("COFFEE QUALITY & ANALYSIS REPORT")
 * Reprodução fiel 1:1 do layout oficial aprovado:
 * - A4 Retrato (210mm x 297mm), fundo branco
 * - Faixas principais em azul-marinho (#0a1c3f), texto branco em caixa alta
 * - Cabeçalhos secundários de tabelas em azul-claro (#f0f4f8, bordas #c2d1e0)
 * - Logo original Unispect no topo à esquerda com proporção preservada
 * - Título central: UNISPECT / — SERVICE & CERTIFICATES — / COFFEE QUALITY & ANALYSIS REPORT
 * - Número no padrão UN0001/AAAA
 * - Seções: SAMPLE IDENTIFICATION, CLASSIFICATION SUMMARY, SCREEN ANALYSIS (%),
 *   DEFECT ANALYSIS (Per 300 g Sample), INSECT DAMAGE / BROCA (somente Equivalent Defects e Percentage (%)),
 *   IMPURITIES (%), COMMENTS, CLASSIFIER / AUTHORIZED SIGNATORY
 * - Rodapé oficial: UNISPECT | Classification sample: 300 g | Page 1/1
 */
export default function CoffeeCertificateReport({
  laudo,
  isDraftPreview = false,
  showSignature = true,
  pageNumber = 1,
  totalPages = 1,
  id = 'coffee-certificate-print-root'
}) {
  if (!laudo) return null;

  const sample = laudo.sampleIdentification || {};
  const summary = laudo.classificationSummary || {};
  const screenAnalysis = laudo.screenAnalysis || {};
  const screens = screenAnalysis.screens || {};
  const defectAnalysis = laudo.defectAnalysis || {};
  const defects = defectAnalysis.defects || {};
  const insectDamage = laudo.insectDamage || {};
  const signatory = laudo.signatory || {};
  const classifier = laudo.classifier || {};

  const isDraft = isDraftPreview || laudo.status === 'Rascunho' || laudo.status === 'Aguardando assinatura';

  const fmt = (val, suffix = '', emptyLabel = '—') => {
    if (val === null || val === undefined || val === '') return emptyLabel;
    if (val === 'NOT_ANALYSED' || val?.notAnalysed) return 'Not analysed';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    if (isNaN(num)) return String(val);
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suffix}`;
  };

  const getDefectField = (key, field) => {
    const item = defects[key];
    if (!item) return '—';
    if (item.notAnalysed || item === 'NOT_ANALYSED') return 'Not analysed';
    const val = item[field];
    return fmt(val);
  };

  const getScreenField = (key) => {
    const item = screens[key];
    if (item === null || item === undefined || item === '') return '—';
    if (item === 'NOT_ANALYSED' || item?.notAnalysed) return 'Not analysed';
    const rawVal = typeof item === 'object' ? item.value : item;
    return fmt(rawVal);
  };

  return (
    <div
      id={id}
      className="coffee-certificate-page a4-page"
      style={{
        width: '21cm',
        minHeight: '29.6cm',
        padding: '1cm 1.3cm 1.2cm 1.3cm',
        boxSizing: 'border-box',
        position: 'relative',
        backgroundColor: '#ffffff',
        color: '#0a1c3f',
        margin: '0 auto',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
        lineHeight: 1.3,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden'
      }}
    >
      {/* Marca d'água de Rascunho / Draft se aplicável */}
      {isDraft && (
        <div
          style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-35deg)',
            fontSize: '52px',
            fontWeight: '900',
            color: 'rgba(217, 119, 6, 0.12)',
            letterSpacing: '8px',
            pointerEvents: 'none',
            zIndex: 10,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            border: '4px dashed rgba(217, 119, 6, 0.2)',
            padding: '14px 32px',
            borderRadius: '14px'
          }}
        >
          DRAFT / RASCUNHO
        </div>
      )}

      {/* ── TOP HEADER: Logo Unispect + Título Oficial + Numeração ──────── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '2px solid #0a1c3f',
            paddingBottom: '8px',
            marginBottom: '10px'
          }}
        >
          <div style={{ width: '95px', flexShrink: 0 }}>
            <img
              src="/logo.jpg"
              alt="Unispect Logo"
              style={{
                width: '85px',
                height: '85px',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>

          <div style={{ textAlign: 'center', flex: 1, paddingLeft: '6px' }}>
            <div style={{ fontSize: '23px', fontWeight: '900', color: '#0a1c3f', letterSpacing: '2px', fontFamily: 'serif' }}>
              UNISPECT
            </div>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#0a1c3f', letterSpacing: '2.5px', margin: '2px 0 5px 0' }}>
              — SERVICE &amp; CERTIFICATES —
            </div>
            <div style={{ fontSize: '15px', fontWeight: '900', color: '#0a1c3f', letterSpacing: '0.8px' }}>
              COFFEE QUALITY &amp; ANALYSIS REPORT
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', padding: '0 4px' }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: '#0a1c3f' }}>
                No. {laudo.laudoNumber || 'UN0001/2026'}
              </div>
              {(laudo.isDemonstration || laudo.isDemonstrative || laudo.laudoNumber === 'UN0001/2026') && (
                <div style={{ border: '1.5px solid #0a1c3f', padding: '2px 8px', fontSize: '8px', fontWeight: '800', color: '#0a1c3f', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  DADOS FICTÍCIOS — DEMONSTRAÇÃO
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 1: SAMPLE IDENTIFICATION ───────────────────────────── */}
        <div style={{ marginBottom: '9px' }}>
          <div
            style={{
              backgroundColor: '#0a1c3f',
              color: '#ffffff',
              fontSize: '9.5px',
              fontWeight: '800',
              letterSpacing: '0.6px',
              padding: '4px 8px',
              textTransform: 'uppercase'
            }}
          >
            SAMPLE IDENTIFICATION
          </div>

          <table
            style={{
              width: '100%',
              fontSize: '8.5px',
              borderCollapse: 'collapse',
              border: '1px solid #c2d1e0'
            }}
          >
            <tbody>
              <tr>
                <td style={tdHeadStyle}>Exporter:</td>
                <td style={tdValStyle}>{sample.exporterName || laudo.exporterNameSnapshot || '—'}</td>
                <td style={tdHeadStyle}>Booking:</td>
                <td style={tdValStyle}>{sample.bookingNumber || laudo.bookingNumber || '—'}</td>
              </tr>
              <tr>
                <td style={tdHeadStyle}>Lot number:</td>
                <td style={tdValStyle}>{sample.lotNumber || (laudo.selectedLotLabels?.[0]) || '—'}</td>
                <td style={tdHeadStyle}>Contract reference:</td>
                <td style={tdValStyle}>{sample.contractReference || '—'}</td>
              </tr>
              <tr>
                <td style={tdHeadStyle}>Crop year:</td>
                <td style={tdValStyle}>{sample.cropYear || '—'}</td>
                <td style={tdHeadStyle}>Quantity of bags:</td>
                <td style={tdValStyle}>{fmt(sample.quantityBags, ' Bags')}</td>
              </tr>
              <tr>
                <td style={tdHeadStyle}>Destination:</td>
                <td style={tdValStyle}>{sample.destination || '—'}</td>
                <td style={tdHeadStyle}>Local inspection:</td>
                <td style={tdValStyle}>{sample.inspectionLocation || '—'}</td>
              </tr>
              <tr>
                <td style={tdHeadStyle}>Dated:</td>
                <td style={tdValStyle}>{sample.inspectionDate || '—'}</td>
                <td style={tdHeadStyle}>Sample ID:</td>
                <td style={tdValStyle}>{sample.sampleId || '—'}</td>
              </tr>
              <tr>
                <td style={tdHeadStyle}>OIC:</td>
                <td style={tdValStyle}>{sample.oicNumber || '—'}</td>
                <td style={tdHeadStyle}>Coffee type:</td>
                <td style={tdValStyle}><strong>{sample.coffeeType || '—'}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── SEÇÃO 2: CLASSIFICATION SUMMARY ─────────────────────────── */}
        <div style={{ marginBottom: '9px' }}>
          <div
            style={{
              backgroundColor: '#0a1c3f',
              color: '#ffffff',
              fontSize: '9.5px',
              fontWeight: '800',
              letterSpacing: '0.6px',
              padding: '4px 8px',
              textTransform: 'uppercase'
            }}
          >
            CLASSIFICATION SUMMARY
          </div>

          <table
            style={{
              width: '100%',
              fontSize: '8.5px',
              borderCollapse: 'collapse',
              border: '1px solid #c2d1e0'
            }}
          >
            <tbody>
              <tr>
                <td style={tdHeadStyle}>Sample weight:</td>
                <td style={tdValStyle}>300 g</td>
                <td style={tdHeadStyle}>Type:</td>
                <td style={tdValStyle}><strong>{summary.classificationType || summary.type || laudo.type || '—'}</strong></td>
                <td style={tdHeadStyle}>Moisture (%):</td>
                <td style={tdValStyle}>{fmt(summary.moisturePercent, '%')}</td>
                <td style={tdHeadStyle}>Total equivalent defects:</td>
                <td style={tdValStyle}>
                  <strong>{summary.totalEquivalentDefects !== null && summary.totalEquivalentDefects !== undefined ? fmt(summary.totalEquivalentDefects) : (summary.defectsComplete === false ? 'Partial' : '—')}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── SEÇÃO 3: SCREEN ANALYSIS (%) ─────────────────────────────── */}
        <div style={{ marginBottom: '9px' }}>
          <div
            style={{
              backgroundColor: '#0a1c3f',
              color: '#ffffff',
              fontSize: '9.5px',
              fontWeight: '800',
              letterSpacing: '0.6px',
              padding: '4px 8px',
              textTransform: 'uppercase'
            }}
          >
            SCREEN ANALYSIS (%)
          </div>

          <table
            style={{
              width: '100%',
              fontSize: '8px',
              borderCollapse: 'collapse',
              border: '1px solid #c2d1e0',
              textAlign: 'center'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f0f4f8', color: '#0a1c3f', fontWeight: '800' }}>
                {COFFEE_OFFICIAL_SCREENS.map(sc => (
                  <th key={sc.key} style={{ border: '1px solid #c2d1e0', padding: '4px 2px' }}>
                    {sc.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {COFFEE_OFFICIAL_SCREENS.map(sc => (
                  <td key={sc.key} style={{ border: '1px solid #c2d1e0', padding: '4px 2px', fontWeight: '600' }}>
                    {getScreenField(sc.key)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── SEÇÃO 4: DEFECT ANALYSIS (Per 300 g Sample) ───────────────── */}
        <div style={{ marginBottom: '9px' }}>
          <div
            style={{
              backgroundColor: '#0a1c3f',
              color: '#ffffff',
              fontSize: '9.5px',
              fontWeight: '800',
              letterSpacing: '0.6px',
              padding: '4px 8px',
              textTransform: 'uppercase'
            }}
          >
            DEFECT ANALYSIS (Per 300 g Sample)
          </div>

          <table
            style={{
              width: '100%',
              fontSize: '8px',
              borderCollapse: 'collapse',
              border: '1px solid #c2d1e0'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f0f4f8', color: '#0a1c3f', fontWeight: 'bold' }}>
                <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', textAlign: 'left', width: '38%' }}>
                  Defect type
                </th>
                <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', textAlign: 'center', width: '20%' }}>
                  Count
                </th>
                <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', textAlign: 'center', width: '22%' }}>
                  Equivalency*
                </th>
                <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', textAlign: 'center', width: '20%' }}>
                  Total defects
                </th>
              </tr>
            </thead>
            <tbody>
              {COFFEE_OFFICIAL_DEFECT_ROWS.map((row) => (
                <tr key={row.key}>
                  <td style={{ border: '1px solid #c2d1e0', padding: '3px 6px' }}>{row.label}</td>
                  <td style={{ border: '1px solid #c2d1e0', padding: '3px 6px', textAlign: 'center' }}>
                    {getDefectField(row.key, 'count')}
                  </td>
                  <td style={{ border: '1px solid #c2d1e0', padding: '3px 6px', textAlign: 'center' }}>
                    {getDefectField(row.key, 'equivalency')}
                  </td>
                  <td style={{ border: '1px solid #c2d1e0', padding: '3px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                    {getDefectField(row.key, 'totalDefects')}
                  </td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f0f4f8', fontWeight: '800' }}>
                <td style={{ border: '1px solid #c2d1e0', padding: '3.5px 6px', textTransform: 'uppercase' }} colSpan="3">
                  TOTAL
                </td>
                <td style={{ border: '1px solid #c2d1e0', padding: '3.5px 6px', textAlign: 'center', color: '#0a1c3f' }}>
                  {defectAnalysis.totalEquivalentDefects !== null && defectAnalysis.totalEquivalentDefects !== undefined
                    ? fmt(defectAnalysis.totalEquivalentDefects)
                    : (defectAnalysis.isComplete === false && defectAnalysis.partialSum > 0 ? `Partial (${fmt(defectAnalysis.partialSum)})` : '—')}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: '7.5px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
            *Equivalências conforme método de classificação a definir.
          </div>
        </div>

        {/* ── SEÇÃO 5 & 6: INSECT DAMAGE / BROCA & IMPURITIES (%) ─────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px', marginBottom: '9px' }}>
          <div>
            <div
              style={{
                backgroundColor: '#0a1c3f',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: '800',
                letterSpacing: '0.6px',
                padding: '4px 8px',
                textTransform: 'uppercase'
              }}
            >
              INSECT DAMAGE / BROCA
            </div>
            <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse', border: '1px solid #c2d1e0', textAlign: 'center' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f4f8', color: '#0a1c3f', fontWeight: 'bold' }}>
                  <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', width: '50%' }}>Equivalent Defects</th>
                  <th style={{ border: '1px solid #c2d1e0', padding: '4px 6px', width: '50%' }}>Percentage (%)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #c2d1e0', padding: '4px 6px', fontWeight: 'bold' }}>
                    {fmt(insectDamage.equivalentDefects)}
                  </td>
                  <td style={{ border: '1px solid #c2d1e0', padding: '4px 6px', fontWeight: 'bold' }}>
                    {fmt(insectDamage.percentage, '%')}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: '7.5px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
              Base de cálculo do percentual a definir.
            </div>
          </div>

          <div>
            <div
              style={{
                backgroundColor: '#0a1c3f',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: '800',
                letterSpacing: '0.6px',
                padding: '4px 8px',
                textTransform: 'uppercase'
              }}
            >
              IMPURITIES (%)
            </div>
            <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse', border: '1px solid #c2d1e0', textAlign: 'center' }}>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #c2d1e0', padding: '11px 6px', fontWeight: 'bold', fontSize: '9px' }}>
                    {fmt(laudo.impuritiesPercent, '%')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SEÇÃO 7: COMMENTS ────────────────────────────────────────── */}
        <div style={{ marginBottom: '9px' }}>
          <div
            style={{
              backgroundColor: '#0a1c3f',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: '800',
              letterSpacing: '0.6px',
              padding: '4px 8px',
              textTransform: 'uppercase'
            }}
          >
            COMMENTS
          </div>
          <div
            style={{
              border: '1px solid #c2d1e0',
              fontSize: '8.5px',
              color: '#1e293b',
              backgroundColor: '#ffffff'
            }}
          >
            {(() => {
              const rawComments = laudo.comments || '';
              const lines = rawComments ? rawComments.split('\n').filter(Boolean) : [];
              return (
                <div>
                  <div style={{ borderBottom: '1px solid #c2d1e0', padding: '3px 8px', minHeight: '16px' }}>
                    {lines[0] || '—'}
                  </div>
                  <div style={{ borderBottom: '1px solid #c2d1e0', padding: '3px 8px', minHeight: '16px' }}>
                    {lines[1] || '—'}
                  </div>
                  <div style={{ padding: '3px 8px', minHeight: '16px' }}>
                    {lines[2] || '—'}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 8 & FOOTER: CLASSIFIER / AUTHORIZED SIGNATORY ─────────── */}
      <div style={{ borderTop: '2px solid #0a1c3f', paddingTop: '6px' }}>
        <div
          style={{
            backgroundColor: '#0a1c3f',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: '800',
            letterSpacing: '0.6px',
            padding: '4px 8px',
            textTransform: 'uppercase',
            marginBottom: '6px'
          }}
        >
          CLASSIFIER / AUTHORIZED SIGNATORY
        </div>

        <table style={{ width: '100%', fontSize: '8.5px', borderCollapse: 'collapse', border: '1px solid #c2d1e0' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', border: '1px solid #c2d1e0', padding: '8px 10px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#0a1c3f', marginBottom: '8px' }}>
                  Name: <span style={{ fontWeight: 'normal', color: '#1e293b' }}>{classifier.name || sample.classifierName || signatory.name || 'Bruno O. G. Lobo'}</span>
                </div>
                <div style={{ borderBottom: '1px solid #94a3b8', width: '90%', height: '22px' }}></div>
              </td>
              <td style={{ width: '50%', border: '1px solid #c2d1e0', padding: '8px 10px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#0a1c3f', marginBottom: '4px' }}>
                  Signature:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ height: '46px', display: 'flex', alignItems: 'center' }}>
                    {(() => {
                      const effectiveSignatureSrc =
                        signatory.signatureImageData ||
                        laudo.signatureImageData ||
                        signatory.signatureImageUrl ||
                        laudo.signatureImageUrl;

                      if (showSignature && !isDraft && effectiveSignatureSrc) {
                        return (
                          <img
                            src={effectiveSignatureSrc}
                            alt={`Signature of ${signatory.name || 'Authorized Signatory'}`}
                            style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain' }}
                          />
                        );
                      }

                      return (
                        <div
                          style={{
                            fontSize: '8px',
                            color: isDraft ? '#d97706' : '#94a3b8',
                            fontStyle: 'italic',
                            border: '1px dashed #cbd5e1',
                            padding: '3px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          {isDraft ? 'Awaiting Signature' : 'No Signature Applied'}
                        </div>
                      );
                    })()}
                  </div>

                  <img
                    src="/stamp.jpg"
                    alt="Unispect Stamp"
                    style={{ width: '50px', height: '50px', objectFit: 'contain', flexShrink: 0 }}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Rodapé Oficial Conforme Layout */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '8px', color: '#0a1c3f', fontWeight: '600', marginTop: '6px' }}>
          <span>UNISPECT</span>
          <span>|</span>
          <span>Classification sample: 300 g</span>
          <span>|</span>
          <span>Page {pageNumber}/{totalPages}</span>
        </div>
      </div>
    </div>
  );
}

const tdHeadStyle = {
  border: '1px solid #c2d1e0',
  padding: '3.5px 6px',
  backgroundColor: '#f0f4f8',
  color: '#0a1c3f',
  fontWeight: 'bold',
  fontSize: '8px',
  width: '25%'
};

const tdValStyle = {
  border: '1px solid #c2d1e0',
  padding: '3.5px 6px',
  color: '#0f172a',
  fontSize: '8px',
  width: '25%'
};
