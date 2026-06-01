import { ChevronLeft, Download, Printer } from 'lucide-react';
import { db } from '../db';

export default function ReportView({ bookingId, reportType, onBack }) {
  const exporters = db.getExportadores();
  const locations = db.getLocais();
  
  const booking = reportType === 'operational' && bookingId 
    ? db.getBookings().find(b => b.id === bookingId) 
    : null;
    
  const bookingsList = reportType === 'administrative' 
    ? db.getBookings() 
    : [];

  // Exportar Word (.docx) via Blob HTML de forma robusta e compatível com Word
  const handleExportWord = () => {
    let htmlContent;
    const filename = reportType === 'operational' 
      ? `Certificado_Estufagem_${booking?.certificateNumber.replace('/', '_')}.doc`
      : `Relatorio_Geral_Administrativo.doc`;

    if (reportType === 'operational' && booking) {
      const exp = exporters.find(e => e.id === booking.exporterId)?.name || 'N/A';
      const loc = locations.find(l => l.id === booking.locationId)?.name || 'N/A';
      
      // Build container tables HTML
      let containersHtml = '';
      (booking.containers || []).forEach((cont, idx) => {
        let seals = (cont.provisionalSeals || []).join(', ') || 'N/A';
        let photosHtml = '';
        const photos = cont.photos || [];
        if (photos.length > 0) {
          photosHtml += '<table style="margin: 15px auto; border-collapse: collapse;">';
          for (let i = 0; i < photos.length; i += 2) {
            photosHtml += '<tr>';
            
            // Coluna 1
            photosHtml += `
              <td style="padding: 10px; vertical-align: top; width: 209px;">
                <table style="width: 209px; height: 279px; border: 1px solid #ccc; background-color: #f8f9fa; border-collapse: collapse;">
                  <tr>
                    <td style="width: 209px; height: 279px; text-align: center; vertical-align: middle; padding: 0;">
                      <img src="${photos[i].url}" style="max-width: 209px; max-height: 279px; width: auto; height: auto; display: block; margin: 0 auto;" />
                    </td>
                  </tr>
                </table>
              </td>
            `;
            
            // Coluna 2
            if (i + 1 < photos.length) {
              photosHtml += `
                <td style="padding: 10px; vertical-align: top; width: 209px;">
                  <table style="width: 209px; height: 279px; border: 1px solid #ccc; background-color: #f8f9fa; border-collapse: collapse;">
                    <tr>
                      <td style="width: 209px; height: 279px; text-align: center; vertical-align: middle; padding: 0;">
                        <img src="${photos[i + 1].url}" style="max-width: 209px; max-height: 279px; width: auto; height: auto; display: block; margin: 0 auto;" />
                      </td>
                    </tr>
                  </table>
                </td>
              `;
            } else {
              photosHtml += '<td style="padding: 10px; width: 209px;"></td>';
            }
            
            photosHtml += '</tr>';
          }
          photosHtml += '</table>';
        }

        containersHtml += `
          <h3 style="font-size: 11pt; font-weight: bold; margin-top: 25px; color: #000; text-transform: uppercase; font-family: Arial, sans-serif;">
            CONTAINER ${idx + 1} OF ${(booking.containers || []).length}: ${cont.containerNumber}
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9.5pt; margin-bottom: 15px;">
            <tr>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a; width: 25%;">CONTAINER NUMBER</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; width: 25%; font-weight: bold; color: #000;">${cont.containerNumber}</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a; width: 25%;">FUMIGATION DATE</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; width: 25%; font-weight: bold; color: #000;">${cont.fumigationDate || 'N/A'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">CONTAINER TYPE</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;">${cont.containerType || '-'}</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">PHYTOSANITARY CERT.</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;">${cont.fitoDate || 'N/A'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">PROVISIONAL SEAL</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;">${seals}</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">DEFINITE SEAL DATE</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;">${cont.definiteSealDate || 'N/A'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">DEFINITE SEAL</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;">${cont.definiteSeal || '-'}</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">INSPECTION STATUS</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: ${cont.status === 'Estufado' ? '#10b981' : '#f59e0b'};">
                ${cont.status === 'Estufado' ? 'FINISHED' : 'IN_PROGRESS'}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; background-color: #f0f4f8; font-weight: bold; color: #4a607a;">TECHNICAL REMARKS</td>
              <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold; color: #000;" colspan="3">${cont.notes || 'None.'}</td>
            </tr>
          </table>
          <div style="margin-top: 10px; margin-bottom: 25px; text-align: center;">
            ${photosHtml || '<p style="font-size: 10pt; color: #666; font-style: italic;">No photos registered for this container.</p>'}
          </div>

          <div style="border-top: 1px solid #c2d1e0; padding-top: 8px; font-size: 10pt; font-weight: bold; color: #000; text-align: center; margin-bottom: 30px; font-family: Arial, sans-serif;">
            “WE UNISPECT CERTIFY THAT THESE CONTAINERS ARE RELEASED FOR SHIPMENT”
          </div>
        `;
      });

      htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <title>Certificado de Estufagem</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.4; color: #000; margin: 40px; }
            h1 { color: #000; font-size: 16pt; margin: 0; font-weight: bold; }
            h2 { color: #000; font-size: 12pt; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; margin-top: 25px; }
            .report-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9.5pt; }
            .report-table td { padding: 6px 8px; border: 1px solid #c2d1e0; }
            .label-cell { background-color: #f0f4f8; font-weight: bold; color: #4a607a; }
            .value-cell { font-weight: bold; color: #000; }
          </style>
        </head>
        <body>
          <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0a1c3f; padding-bottom: 10px; margin-bottom: 20px;">
            <tr>
              <td style="vertical-align: middle; width: 130px;">
                <img src="/logo.jpg" height="110" />
              </td>
              <td style="vertical-align: middle; padding-left: 18px; border-left: 2.5px solid #0a1c3f;">
                <div style="font-size: 20pt; font-weight: bold; color: #0a1c3f; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">UNISPECT</div>
                <div style="font-size: 11pt; font-weight: bold; color: #b88f28; text-transform: uppercase; letter-spacing: 1.5px; font-family: Arial, sans-serif; margin-top: 2px;">Service & certificate</div>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <h2 style="font-size: 12pt; font-weight: bold; color: #000; margin: 0; font-family: Arial, sans-serif;">${booking.type === 'Container Stuffing Report' ? 'CONTAINER STUFFING REPORT' : 'REDEX OPERATION REPORT'}</h2>
                <span style="font-size: 10pt; font-weight: bold; color: #10b981; font-family: Arial, sans-serif;">CERTIFICADO: ${booking.certificateNumber}</span>
              </td>
            </tr>
          </table>

          <p style="font-size: 16pt; text-align: justify; margin: 15px 0; line-height: 1.5; font-family: Arial, sans-serif;">
            ${booking.type === 'Container Stuffing Report' 
              ? `WE HEREBY CERTIFY that the undersigned surveyors, acting at the request and on behalf of INTERPORT LOGISTICA LTDA, supervised the coffee cargo stuffing operation, fumigation process, MAPA (Brazilian Ministry of Agriculture) inspection, and the application of the carrier's final seal to the containers at Interport Terminal.<br/><br/>The operation was carried out under our supervision, and all activities were performed in accordance with the applicable procedures, regulations, and instructions in force at the time of loading.`
              : `WE HEREBY CERTIFY that the undersigned surveyors, acting at the request and on behalf of INTERPORT LOGISTICA LTDA, supervised all operations carried out within the REDEX bonded area, including the receiving process of the containers, the inspection conducted by MAPA (Brazilian Ministry of Agriculture and Livestock), and the application of the carrier's final seal at the Interport REDEX Facility in Vila Velha, Brazil.<br/><br/>All operations were performed under our supervision, and all activities were conducted in accordance with the applicable procedures, regulations, and requirements in force at the time of the operation.`
            }
          </p>

          <h2>1. BOOKING OPERATIONAL DATA</h2>
          <table class="report-table">
            <tr>
              <td class="label-cell" style="width: 25%;">CERTIFICATE NO.</td>
              <td class="value-cell" style="width: 25%;">${booking.certificateNumber}</td>
              <td class="label-cell" style="width: 25%;">BOOKING NO.</td>
              <td class="value-cell" style="width: 25%;">${booking.bookingNumber}</td>
            </tr>
            <tr>
              <td class="label-cell">EXPORTER</td>
              <td class="value-cell">${exp}</td>
              <td class="label-cell">OPERATIONAL SITE</td>
              <td class="value-cell">${loc}</td>
            </tr>
            <tr>
              <td class="label-cell">VESSEL</td>
              <td class="value-cell">${booking.vesselVoyage ? booking.vesselVoyage.split(' V.')[0] : '-'}</td>
              <td class="label-cell">VOYAGE</td>
              <td class="value-cell">${booking.vesselVoyage ? booking.vesselVoyage.split(' V.')[1] : '-'}</td>
            </tr>
            <tr>
              <td class="label-cell">CARRIER</td>
              <td class="value-cell">${booking.armador || '-'}</td>
              <td class="label-cell">COMMODITY / CARGO</td>
              <td class="value-cell">${booking.mercadoria}</td>
            </tr>
            <tr>
              <td class="label-cell">QTY. OF CONTAINERS</td>
              <td class="value-cell">${booking.containers?.length || 0} Cts</td>
              <td class="label-cell">QTY. OF BAGS / PACKAGING</td>
              <td class="value-cell">${booking.bagsQuantity} Bags (${booking.embalagem})</td>
            </tr>
          </table>

          <h2>2. CONTAINERS PACKING LIST</h2>
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9.5pt; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f0f4f8;">
                <th style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: left; font-weight: bold;">CONTAINER</th>
                <th style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: left; font-weight: bold;">TYPE</th>
                <th style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: left; font-weight: bold;">DEFINITE SEAL</th>
                <th style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: center; font-weight: bold;">QTY. OF BAGS</th>
                <th style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: left; font-weight: bold;">COMMODITY</th>
              </tr>
            </thead>
            <tbody>
              ${(booking.containers || []).map(cont => `
                <tr>
                  <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold;">${cont.containerNumber}</td>
                  <td style="border: 1px solid #c2d1e0; padding: 6px 8px;">${cont.containerType || '-'}</td>
                  <td style="border: 1px solid #c2d1e0; padding: 6px 8px; font-weight: bold;">${cont.definiteSeal || '-'}</td>
                  <td style="border: 1px solid #c2d1e0; padding: 6px 8px; text-align: center;">
                    ${(cont.bagsQuantity !== undefined && cont.bagsQuantity !== null && cont.bagsQuantity !== '')
                      ? `${cont.bagsQuantity} Bags`
                      : (booking.containers.length > 1 
                        ? `${Math.round(booking.bagsQuantity / booking.containers.length)} Bags` 
                        : `${booking.bagsQuantity} Bags`)} (${booking.embalagem || 'sacaria'})
                  </td>
                  <td style="border: 1px solid #c2d1e0; padding: 6px 8px; text-transform: uppercase;">${booking.mercadoria || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>3. DETAILS OF INSPECTED CONTAINERS</h2>
          ${containersHtml}

          <table style="width: 100%; border-top: 1px solid #999; margin-top: 50px; font-size: 9pt; color: #666; font-family: Arial, sans-serif;">
            <tr>
              <td>Authenticity: UNISPECT-CERT-${booking.certificateNumber.replace('/', '-')} - Consolidated Document</td>
              <td style="text-align: right;">Page 1</td>
            </tr>
          </table>
        </body>
        </html>
      `;
    } else {
      // Administrative Report Word
      let rowsHtml = '';
      bookingsList.forEach(b => {
        const exp = exporters.find(e => e.id === b.exporterId)?.name || 'N/A';
        const loc = locations.find(l => l.id === b.locationId)?.name || 'N/A';
        rowsHtml += `
          <tr>
            <td style="border: 1px solid #ccc; padding: 6px; font-weight: bold;">${b.certificateNumber}</td>
            <td style="border: 1px solid #ccc; padding: 6px;">${b.bookingNumber}</td>
            <td style="border: 1px solid #ccc; padding: 6px;">${exp}</td>
            <td style="border: 1px solid #ccc; padding: 6px;">${b.vesselVoyage}</td>
            <td style="border: 1px solid #ccc; padding: 6px;">${loc}</td>
            <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${b.containers?.length || 0}</td>
            <td style="border: 1px solid #ccc; padding: 6px; text-align: right;">${b.bagsQuantity}</td>
            <td style="border: 1px solid #ccc; padding: 6px; text-align: center; font-weight: bold;">${(b.status || 'Pendente').toUpperCase()}</td>
          </tr>
        `;
      });

      htmlContent = `
        <html>
        <head>
          <title>General Administrative Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
            th { background-color: #f2f2f2; font-weight: bold; border: 1px solid #ccc; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>General Administrative Report - Unispect</h1>
          <table>
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Booking</th>
                <th>Exporter</th>
                <th>Vessel / Voyage</th>
                <th>Site</th>
                <th style="text-align: center;">Containers</th>
                <th style="text-align: right;">Bags</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
        </html>
      `;
    }

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Algoritmo matemático para distribuir as fotos minimizando espaços vazios e número de páginas
  const distributePhotos = (N) => {
    if (N === 0) return [];
    
    const pages = [];
    let tempN = N;
    
    while (tempN > 0) {
      if (tempN >= 4) {
        pages.push(4);
        tempN -= 4;
      } else {
        pages.push(tempN);
        tempN = 0;
      }
    }
    
    // Se a última página ficar com 1 foto, redistribui com a penúltima (ex: de [4, 1] para [3, 2])
    if (pages.length > 1 && pages[pages.length - 1] === 1) {
      pages[pages.length - 2] = 3;
      pages[pages.length - 1] = 2;
    }
    
    return pages;
  };

  // Função para paginar o conteúdo do relatório
  const getReportPages = () => {
    const pages = [];
    if (!booking) return pages;

    const expName = exporters.find(e => e.id === booking.exporterId)?.name || 'N/A';
    const locName = locations.find(l => l.id === booking.locationId)?.name || 'N/A';

    // Página 1: Dados Operacionais Gerais da Reserva
    pages.push({
      type: 'cover',
      expName,
      locName
    });

    // Páginas dos Containers
    (booking.containers || []).forEach((cont, contIdx) => {
      const photos = cont.photos || [];
      const totalPhotos = photos.length;
      const photoDistribution = distributePhotos(totalPhotos);

      if (photoDistribution.length === 0) {
        // Sem fotos, renderiza apenas a página principal do container
        pages.push({
          type: 'container_main',
          container: cont,
          containerIndex: contIdx,
          photos: []
        });
      } else {
        let photoIndex = 0;
        photoDistribution.forEach((count, idx) => {
          const pagePhotos = photos.slice(photoIndex, photoIndex + count);
          photoIndex += count;

          if (idx === 0) {
            // A primeira página do container (com tabela)
            pages.push({
              type: 'container_main',
              container: cont,
              containerIndex: contIdx,
              photos: pagePhotos
            });
          } else {
            // Páginas subsequentes do container (apenas fotos)
            pages.push({
              type: 'container_photos',
              container: cont,
              containerIndex: contIdx,
              photos: pagePhotos
            });
          }
        });
      }
    });

    return pages;
  };

  const handlePrint = () => {
    // Se a biblioteca html2pdf estiver disponível, gera o PDF automaticamente
    if (window.html2pdf) {
      const element = document.getElementById('printable-content');
      if (!element) return;

      const opt = {
        margin:       0,
        filename:     `Certificado_Estufagem_${booking?.certificateNumber.replace('/', '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'cm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      window.html2pdf().from(element).set(opt).save();
    } else {
      // Fallback para diálogo de impressão nativo
      window.print();
    }
  };

  if (reportType === 'operational' && !booking) return <div style={{ padding: '20px' }}>Loading report data...</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Barra de Ferramentas */}
      <div className="no-print" style={{
        padding: '16px 20px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        flexShrink: 0
      }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ChevronLeft size={16} /> Back
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportWord} className="btn btn-secondary" style={{ backgroundColor: 'var(--bg-tertiary)', border: 'none' }}>
            <Download size={16} /> Export Word
          </button>
          <button onClick={handlePrint} className="btn btn-primary" style={{ backgroundColor: 'var(--color-brand)', color: '#05070f' }}>
            <Printer size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Visualizador / Área de Impressão */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: 'var(--bg-primary)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }} id="printable-area-wrapper" className="a4-preview-wrapper">
        
        <div id="printable-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'transparent' }}>
          {reportType === 'operational' && booking && (() => {
            const pages = getReportPages();
            const totalPages = pages.length;

            return pages.map((page, pageIdx) => {
              const pageNum = pageIdx + 1;
              
              return (
                <div key={pageIdx} className="a4-page">
                  
                  {/* 1. CABEÇALHO OFICIAL UNISPECT */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #0a1c3f', paddingBottom: '10px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                      <img src="/logo.jpg" alt="Unispect Logo" style={{ height: '110px', objectFit: 'contain' }} />
                      <div style={{ borderLeft: '2.5px solid #0a1c3f', paddingLeft: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '26px', fontWeight: '850', fontFamily: 'Arial, sans-serif', color: '#0a1c3f', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          UNISPECT
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#b88f28', textTransform: 'uppercase', marginTop: '2px', letterSpacing: '1.5px' }}>
                          Service & certificate
                        </span>
                      </div>
                    </div>

                    {/* Título do Relatório */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: '#000', letterSpacing: '0.5px' }}>
                        {booking.type === 'Container Stuffing Report' ? 'CONTAINER STUFFING REPORT' : 'REDEX OPERATION REPORT'}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>
                        CERTIFICADO: {booking.certificateNumber}
                      </div>
                    </div>
                  </div>

                  {/* CONTEÚDO ESPECÍFICO DA PÁGINA */}
                  {page.type === 'cover' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Parágrafo de Certificação Exato */}
                      <p style={{ fontSize: '16px', textAlign: 'justify', margin: '8px 0', color: '#111', lineHeight: '1.5', fontWeight: '500', whiteSpace: 'pre-line' }}>
                        {booking.type === 'Container Stuffing Report'
                          ? `WE HEREBY CERTIFY that the undersigned surveyors, acting at the request and on behalf of INTERPORT LOGISTICA LTDA, supervised the coffee cargo stuffing operation, fumigation process, MAPA (Brazilian Ministry of Agriculture) inspection, and the application of the carrier's final seal to the containers at Interport Terminal.\n\nThe operation was carried out under our supervision, and all activities were performed in accordance with the applicable procedures, regulations, and instructions in force at the time of loading.`
                          : `WE HEREBY CERTIFY that the undersigned surveyors, acting at the request and on behalf of INTERPORT LOGISTICA LTDA, supervised all operations carried out within the REDEX bonded area, including the receiving process of the containers, the inspection conducted by MAPA (Brazilian Ministry of Agriculture and Livestock), and the application of the carrier's final seal at the Interport REDEX Facility in Vila Velha, Brazil.\n\nAll operations were performed under our supervision, and all activities were conducted in accordance with the applicable procedures, regulations, and requirements in force at the time of the operation.`
                        }
                      </p>

                      <div>
                        <h3 style={{ fontSize: '11.5px', fontWeight: '800', color: '#000', borderBottom: '2px solid #0a1c3f', paddingBottom: '4px', marginBottom: '8px', textTransform: 'uppercase' }}>
                          1. BOOKING OPERATIONAL DATA
                        </h3>
                        
                        <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse', border: '1px solid #c2d1e0' }}>
                          <tbody>
                            <tr>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', width: '25%', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>CERTIFICATE NO.</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', width: '25%', fontWeight: 'bold' }}>{booking.certificateNumber}</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', width: '25%', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>BOOKING NO.</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', width: '25%', fontWeight: 'bold' }}>{booking.bookingNumber}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>EXPORTER</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{page.expName}</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>OPERATIONAL SITE</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{page.locName}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>VESSEL</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.vesselVoyage ? booking.vesselVoyage.split(' V.')[0] : '-'}</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>VOYAGE</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.vesselVoyage ? booking.vesselVoyage.split(' V.')[1] : '-'}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>CARRIER</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.armador || '-'}</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>COMMODITY / CARGO</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.mercadoria || '-'}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>QTY. OF CONTAINERS</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.containers?.length || 0} Cts</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9.5px' }}>QTY. OF BAGS / PACKAGING</td>
                              <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{booking.bagsQuantity} Bags ({booking.embalagem || 'sacaria'})</td>
                            </tr>
                          </tbody>
                        </table>

                        <h3 style={{ fontSize: '11.5px', fontWeight: '800', color: '#000', borderBottom: '2px solid #0a1c3f', paddingBottom: '4px', marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase' }}>
                          PACKING LIST
                        </h3>
                        
                        <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse', border: '1px solid #c2d1e0' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f0f4f8' }}>
                              <th style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', fontSize: '9.5px', color: '#4a607a' }}>CONTAINER</th>
                              <th style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', fontSize: '9.5px', color: '#4a607a' }}>TYPE</th>
                              <th style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', fontSize: '9.5px', color: '#4a607a' }}>DEFINITE SEAL</th>
                              <th style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '9.5px', color: '#4a607a' }}>QTY. OF BAGS</th>
                              <th style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', fontSize: '9.5px', color: '#4a607a' }}>COMMODITY</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(booking.containers || []).map((cont, cIdx) => (
                              <tr key={cont.id || cIdx}>
                                <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{cont.containerNumber}</td>
                                <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px' }}>{cont.containerType || '-'}</td>
                                <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', fontWeight: 'bold' }}>{cont.definiteSeal || '-'}</td>
                                <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textAlign: 'center' }}>
                                  {(cont.bagsQuantity !== undefined && cont.bagsQuantity !== null && cont.bagsQuantity !== '')
                                    ? `${cont.bagsQuantity} Bags`
                                    : (booking.containers.length > 1 
                                      ? `${Math.round(booking.bagsQuantity / booking.containers.length)} Bags` 
                                      : `${booking.bagsQuantity} Bags`)} ({booking.embalagem || 'sacaria'})
                                </td>
                                <td style={{ border: '1px solid #c2d1e0', padding: '6px 8px', textTransform: 'uppercase' }}>{booking.mercadoria || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {page.type === 'container_main' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h3 style={{ fontSize: '11px', fontWeight: '800', color: '#000', borderBottom: '2px solid #0a1c3f', paddingBottom: '4px', margin: 0, textTransform: 'uppercase' }}>
                        3. DETAILS OF INSPECTED CONTAINERS
                      </h3>
                      
                      <div style={{ fontSize: '10.5px', fontWeight: 'bold', color: '#000', textTransform: 'uppercase', marginTop: '2px' }}>
                        CONTAINER {page.containerIndex + 1} OF {booking.containers.length}: {page.container.containerNumber}
                      </div>

                      <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', border: '1px solid #c2d1e0' }}>
                        <tbody>
                          <tr>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', width: '25%', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>CONTAINER NUMBER</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', width: '25%', fontWeight: 'bold' }}>{page.container.containerNumber}</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', width: '25%', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>FUMIGATION DATE</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', width: '25%', fontWeight: 'bold' }}>{page.container.fumigationDate || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>CONTAINER TYPE</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }}>{page.container.containerType || '-'}</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>PHYTOSANITARY CERT.</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }}>{page.container.fitoDate || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>PROVISIONAL SEAL</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }}>
                              {(page.container.provisionalSeals || []).join(', ') || 'N/A'}
                            </td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>DEFINITE SEAL DATE</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }}>{page.container.definiteSealDate || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>DEFINITE SEAL</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }}>{page.container.definiteSeal || '-'}</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>INSPECTION STATUS</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold', color: page.container.status === 'Estufado' ? '#10b981' : '#f59e0b' }}>
                              {page.container.status === 'Estufado' ? 'FINISHED' : 'IN_PROGRESS'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', backgroundColor: '#f0f4f8', color: '#4a607a', fontWeight: 'bold', fontSize: '9px' }}>TECHNICAL REMARKS</td>
                            <td style={{ border: '1px solid #c2d1e0', padding: '5px 7px', fontWeight: 'bold' }} colSpan="3">{page.container.notes || 'None.'}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Fotos */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 209px)',
                        gap: '16px 24px',
                        justifyContent: 'center',
                        marginTop: '10px'
                      }}>
                        {page.photos.map((photo) => (
                          <div key={photo.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{
                              width: '209px',
                              height: '279px',
                              minWidth: '209px',
                              maxWidth: '209px',
                              minHeight: '279px',
                              maxHeight: '279px',
                              backgroundColor: '#f8f9fa',
                              border: '2px solid #ddd',
                              borderRadius: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              flexShrink: 0
                            }}>
                              <img 
                                src={photo.url} 
                                alt={photo.name} 
                                style={{ 
                                  width: '100%', 
                                  height: '100%',
                                  minWidth: '100%',
                                  maxWidth: '100%',
                                  minHeight: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain', 
                                  display: 'block' 
                                }} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {page.photos.length === 0 && (
                        <p style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', paddingLeft: '4px', margin: '4px 0' }}>
                          No photos registered for this container.
                        </p>
                      )}
                    </div>
                  )}

                  {page.type === 'container_photos' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', textTransform: 'uppercase', borderBottom: '2px solid #0a1c3f', paddingBottom: '4px', margin: 0 }}>
                        CONTAINER {page.containerIndex + 1} OF {booking.containers.length}: {page.container.containerNumber} - PHOTOS (CONTINUED)
                      </div>

                      {/* Fotos organizadas em grade de no máximo 4 por página */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 209px)',
                        gap: '16px 24px',
                        justifyContent: 'center',
                        marginTop: '10px'
                      }}>
                        {page.photos.map((photo) => (
                          <div key={photo.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{
                              width: '209px',
                              height: '279px',
                              minWidth: '209px',
                              maxWidth: '209px',
                              minHeight: '279px',
                              maxHeight: '279px',
                              backgroundColor: '#f8f9fa',
                              border: '2px solid #ddd',
                              borderRadius: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              flexShrink: 0
                            }}>
                              <img 
                                src={photo.url} 
                                alt={photo.name} 
                                style={{ 
                                  width: '100%', 
                                  height: '100%',
                                  minWidth: '100%',
                                  maxWidth: '100%',
                                  minHeight: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain', 
                                  display: 'block' 
                                }} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Texto de Conclusão nos Containers */}
                  {(page.type === 'container_main' || page.type === 'container_photos') && (
                    <div style={{
                      borderTop: '1px solid #c2d1e0',
                      paddingTop: '8px',
                      marginTop: '15px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: '#000',
                      textAlign: 'center',
                      fontFamily: 'Arial, sans-serif'
                    }}>
                      “WE UNISPECT CERTIFY THAT THESE CONTAINERS ARE RELEASED FOR SHIPMENT”
                    </div>
                  )}

                  {/* Absolute Footer */}
                  <div className="a4-footer">
                    <span>Authenticity: UNISPECT-CERT-{booking.certificateNumber.replace('/', '-')} - Consolidated Document</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span>Page {pageNum} of {totalPages}</span>
                      <img src="/stamp.jpg" alt="Unispect Stamp" style={{ width: '75px', height: '75px', objectFit: 'contain' }} />
                    </div>
                  </div>

                </div>
              );
            });
          })()}
        </div>

        {/* RELATÓRIO GERAL ADMINISTRATIVO */}
        {reportType === 'administrative' && (
          <div className="a4-page" style={{ height: 'auto', minHeight: '29.6cm' }}>
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '18px', color: '#000', margin: 0, fontWeight: 'bold' }}>General Administrative Report</h1>
                <span style={{ fontSize: '11px', color: '#666' }}>Consolidation of Inspections and Certificates</span>
              </div>
              <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>Issued: {new Date().toLocaleDateString()}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid #ccc' }}>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#000' }}>Certificate</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#000' }}>Booking</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#000' }}>Exporter</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#000' }}>Vessel / Voyage</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#000' }}>Site</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: '#000' }}>Containers</th>
                  <th style={{ padding: '8px', textAlign: 'right', color: '#000' }}>Bags</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: '#000' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookingsList.map(b => {
                  const exp = exporters.find(e => e.id === b.exporterId)?.name || 'N/A';
                  const loc = locations.find(l => l.id === b.locationId)?.name || 'N/A';
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{b.certificateNumber}</td>
                      <td style={{ padding: '8px' }}>{b.bookingNumber}</td>
                      <td style={{ padding: '8px' }}>{exp}</td>
                      <td style={{ padding: '8px' }}>{b.vesselVoyage}</td>
                      <td style={{ padding: '8px' }}>{loc}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{b.containers?.length || 0}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{b.bagsQuantity}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{(b.status || 'Pendente').toUpperCase()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .a4-page {
          width: 21cm;
          height: 29.6cm;
          padding: 1.2cm 1.5cm 1.8cm 1.5cm;
          box-sizing: border-box;
          position: relative;
          background-color: #fff;
          color: #000;
          margin: 0 auto;
          box-shadow: none;
          font-family: Arial, sans-serif;
          line-height: 1.4;
          flex-shrink: 0;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .a4-page table td {
          color: #000 !important;
          border-color: #c2d1e0 !important;
        }
        .a4-page table th {
          color: #000 !important;
          border-color: #c2d1e0 !important;
        }
        .a4-page p, .a4-page span, .a4-page div, .a4-page h3, .a4-page h2, .a4-page h1 {
          color: #000 !important;
        }
        .a4-preview-wrapper .a4-page {
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          margin-bottom: 20px;
        }
        .a4-footer {
          position: absolute;
          bottom: 0.6cm;
          left: 1.5cm;
          right: 1.5cm;
          border-top: 1px solid #999;
          padding-top: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          color: #666;
        }
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          html, body, #root, .app-container, .main-content {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            overflow-y: visible !important;
            position: static !important;
            display: block !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          #printable-area-wrapper {
            background-color: transparent !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .a4-page {
            width: 21cm !important;
            height: 29.6cm !important;
            margin: 0 auto !important;
            padding: 1.2cm 1.5cm 1.8cm 1.5cm !important;
            box-shadow: none !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            position: relative !important;
          }
        }
      `}} />

    </div>
  );
}
