import { useState, useMemo, useEffect, useRef } from 'react';
import {
  db,
  useExportadores,
  formatExporterCnpj,
  formatExporterDateBr,
  generateNextExporterCode
} from '../db';
import { doc, setDoc } from 'firebase/firestore';
import { dbFirestore } from '../firebase';

export default function ExportadoresList({ onDataChange }) {
  const exportadores = useExportadores();
  const [showModal, setShowModal] = useState(false);
  const [editingExp, setEditingExp] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('code'); // 'code' | 'name' | 'registrationDate' | 'cnpj'
  const [sortOrder, setSortOrder] = useState('asc');
  const [copiedCodeId, setCopiedCodeId] = useState(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    registrationDate: new Date().toISOString().split('T')[0],
    cnpj: '',
    email: '',
    phone: '',
    omitNameInDocuments: false
  });

  // Garante persistência automática do Código de Cadastro e Data de Cadastro nos registros antigos do Firestore
  const backfilledIdsRef = useRef(new Set());
  useEffect(() => {
    if (!Array.isArray(exportadores) || exportadores.length === 0) return;
    exportadores.forEach(exp => {
      if (!exp?.id || backfilledIdsRef.current.has(exp.id)) return;
      backfilledIdsRef.current.add(exp.id);
      // Grava silenciosamente o código e data gerados caso ainda não estejam persistidos no documento
      setDoc(
        doc(dbFirestore, 'exportadores', exp.id),
        {
          code: exp.code,
          registrationDate: exp.registrationDate,
          cnpj: exp.cnpj || '',
          omitNameInDocuments: Boolean(exp.omitNameInDocuments)
        },
        { merge: true }
      ).catch(() => {});
    });
  }, [exportadores]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    const filtered = (exportadores || []).filter(exp => {
      if (!q) return true;
      const code = String(exp.code || '').toLowerCase();
      const name = String(exp.name || '').toLowerCase();
      const cnpj = String(exp.cnpj || '').toLowerCase();
      const cnpjDigits = cnpj.replace(/\D/g, '');
      const email = String(exp.email || '').toLowerCase();
      const phone = String(exp.phone || '').toLowerCase();
      const dateBr = formatExporterDateBr(exp.registrationDate).toLowerCase();

      return (
        code.includes(q) ||
        name.includes(q) ||
        cnpj.includes(q) ||
        (qDigits && cnpjDigits.includes(qDigits)) ||
        email.includes(q) ||
        phone.includes(q) ||
        dateBr.includes(q)
      );
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'code') {
        cmp = String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR', { numeric: true });
      } else if (sortField === 'name') {
        cmp = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
      } else if (sortField === 'registrationDate') {
        cmp = String(a.registrationDate || '').localeCompare(String(b.registrationDate || ''));
      } else if (sortField === 'cnpj') {
        cmp = String(a.cnpj || '').localeCompare(String(b.cnpj || ''));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [exportadores, searchQuery, sortField, sortOrder]);

  const handleOpenAdd = () => {
    const nextCode = generateNextExporterCode(exportadores);
    setEditingExp(null);
    setFormData({
      code: nextCode,
      name: '',
      registrationDate: new Date().toISOString().split('T')[0],
      cnpj: '',
      email: '',
      phone: '',
      omitNameInDocuments: false
    });
    setShowModal(true);
  };

  const handleOpenEdit = (exp) => {
    setEditingExp(exp);
    setFormData({
      code: exp.code || generateNextExporterCode(exportadores),
      name: exp.name || '',
      registrationDate: exp.registrationDate || new Date().toISOString().split('T')[0],
      cnpj: formatExporterCnpj(exp.cnpj || ''),
      email: exp.email || '',
      phone: exp.phone || '',
      omitNameInDocuments: Boolean(exp.omitNameInDocuments)
    });
    setShowModal(true);
  };

  const handleToggleOmitName = async (exp) => {
    await db.saveExportador({
      ...exp,
      omitNameInDocuments: !exp.omitNameInDocuments
    });
    if (onDataChange) onDataChange();
  };

  const handleCopyCode = (exp) => {
    if (navigator.clipboard && exp.code) {
      navigator.clipboard.writeText(exp.code).catch(() => {});
      setCopiedCodeId(exp.id);
      setTimeout(() => setCopiedCodeId(null), 1500);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir este exportador?')) {
      await db.deleteExportador(id);
      if (onDataChange) onDataChange();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    await db.saveExportador({
      id: editingExp ? editingExp.id : undefined,
      code: formData.code.trim().toUpperCase() || generateNextExporterCode(exportadores),
      name: formData.name.trim(),
      registrationDate: formData.registrationDate || new Date().toISOString().split('T')[0],
      cnpj: formatExporterCnpj(formData.cnpj),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      omitNameInDocuments: Boolean(formData.omitNameInDocuments)
    });

    setShowModal(false);
    if (onDataChange) onDataChange();
  };

  const handleExportExcelCsv = () => {
    let csv = 'sep=;\n';
    csv += 'Codigo;Nome Exportador;Data de Cadastro;CNPJ;Codigo Documento (Modo Exibicao);E-mail;Telefone\n';

    filteredAndSorted.forEach(exp => {
      const code = (exp.code || '').replace(/;/g, ',');
      const name = (exp.name || '').replace(/;/g, ',');
      const dateBr = formatExporterDateBr(exp.registrationDate);
      const cnpj = (exp.cnpj || '-').replace(/;/g, ',');
      const docMode = exp.omitNameInDocuments ? `Apenas Codigo (${code})` : `Nome Completo (${code})`;
      const email = (exp.email || '-').replace(/;/g, ',');
      const phone = (exp.phone || '-').replace(/;/g, ',');
      csv += `${code};${name};${dateBr};${cnpj};${docMode};${email};${phone}\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exportadores_Unispect_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSortArrow = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.35, marginLeft: '4px', fontSize: '10px' }}>↕</span>;
    return <span style={{ color: 'var(--color-brand)', marginLeft: '4px', fontSize: '10px' }}>{sortOrder === 'asc' ? '▲' : '▼'}</span>;
  };

  const excelCellStyle = {
    border: '1px solid var(--border-color)',
    padding: '6px 10px',
    fontSize: '12.5px',
    color: 'var(--text-primary)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap'
  };

  const excelHeaderStyle = {
    border: '1px solid var(--border-color)',
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    textAlign: 'left',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Barra Superior Compacta */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        backgroundColor: 'var(--bg-secondary)',
        padding: '10px 14px',
        border: '1px solid var(--border-color)',
        borderRadius: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: '800',
            color: 'var(--color-brand)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            margin: 0
          }}>
            Planilha de Exportadores Cadastrados
          </h3>
          <span style={{
            fontSize: '11px',
            fontWeight: '700',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)'
          }}>
            {filteredAndSorted.length} de {exportadores.length} registros
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filtrar por código (EXP-0001), nome, CNPJ..."
            style={{
              width: '270px',
              height: '32px',
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)'
            }}
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn btn-secondary"
              style={{ height: '32px', padding: '0 10px', fontSize: '11px' }}
            >
              Limpar
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcelCsv}
            className="btn btn-secondary"
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: '700',
              border: '1px solid var(--border-color)'
            }}
            title="Baixar planilha em formato compatível com Excel (.CSV)"
          >
            Exportar Excel
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn btn-primary"
            style={{ height: '32px', padding: '0 14px', fontSize: '12px', fontWeight: '700' }}
          >
            + Novo Exportador
          </button>
        </div>
      </div>

      {/* Tabela Estilo Planilha Excel */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'auto',
            fontFamily: 'var(--font-sans, Arial, sans-serif)'
          }}>
            <thead>
              <tr>
                <th style={{ ...excelHeaderStyle, width: '42px', textAlign: 'center' }}>#</th>
                <th
                  onClick={() => handleSort('code')}
                  style={{ ...excelHeaderStyle, width: '115px', cursor: 'pointer' }}
                >
                  Código {renderSortArrow('code')}
                </th>
                <th
                  onClick={() => handleSort('name')}
                  style={{ ...excelHeaderStyle, minWidth: '260px', cursor: 'pointer' }}
                >
                  Nome Exportador {renderSortArrow('name')}
                </th>
                <th
                  onClick={() => handleSort('registrationDate')}
                  style={{ ...excelHeaderStyle, width: '130px', textAlign: 'center', cursor: 'pointer' }}
                >
                  Data de Cadastro {renderSortArrow('registrationDate')}
                </th>
                <th
                  onClick={() => handleSort('cnpj')}
                  style={{ ...excelHeaderStyle, width: '165px', cursor: 'pointer' }}
                >
                  CNPJ {renderSortArrow('cnpj')}
                </th>
                <th
                  style={{ ...excelHeaderStyle, width: '215px' }}
                  title="Define se documentos/certificados exibem o Nome do Exportador ou apenas o Código de Cadastro"
                >
                  Código p/ Documento
                </th>
                <th style={{ ...excelHeaderStyle, width: '200px' }}>
                  Contato (E-mail / Tel)
                </th>
                <th style={{ ...excelHeaderStyle, width: '125px', textAlign: 'center' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map((exp, idx) => {
                const isEven = idx % 2 === 1;
                const rowBg = isEven ? 'var(--bg-tertiary)' : 'var(--bg-secondary)';

                return (
                  <tr
                    key={exp.id}
                    style={{ backgroundColor: rowBg }}
                  >
                    {/* # Linha tipo Excel */}
                    <td style={{
                      ...excelCellStyle,
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-tertiary)'
                    }}>
                      {idx + 1}
                    </td>

                    {/* Código */}
                    <td style={{
                      ...excelCellStyle,
                      fontFamily: 'monospace',
                      fontWeight: '800',
                      color: 'var(--color-brand)',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleCopyCode(exp)}
                    title="Clique para copiar o Código de Cadastro"
                    >
                      {exp.code}
                      {copiedCodeId === exp.id && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#10b981', fontFamily: 'sans-serif' }}>
                          Copiado
                        </span>
                      )}
                    </td>

                    {/* Nome Exportador */}
                    <td style={{
                      ...excelCellStyle,
                      fontWeight: '700',
                      whiteSpace: 'normal',
                      lineHeight: '1.25'
                    }}>
                      {exp.name}
                    </td>

                    {/* Data de Cadastro */}
                    <td style={{
                      ...excelCellStyle,
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      {formatExporterDateBr(exp.registrationDate)}
                    </td>

                    {/* CNPJ */}
                    <td style={{
                      ...excelCellStyle,
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: exp.cnpj ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}>
                      {exp.cnpj || '-'}
                    </td>

                    {/* Código p/ Documento (Omitir Nome) */}
                    <td style={excelCellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: '700',
                          fontSize: '12px',
                          color: exp.omitNameInDocuments ? '#059669' : 'var(--text-secondary)'
                        }}>
                          {exp.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleOmitName(exp)}
                          style={{
                            padding: '2px 7px',
                            fontSize: '10.5px',
                            fontWeight: '700',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            border: exp.omitNameInDocuments
                              ? '1px solid #10b981'
                              : '1px solid var(--border-color)',
                            backgroundColor: exp.omitNameInDocuments
                              ? 'rgba(16, 185, 129, 0.14)'
                              : 'var(--bg-primary)',
                            color: exp.omitNameInDocuments
                              ? '#059669'
                              : 'var(--text-secondary)'
                          }}
                          title="Clique para alternar entre exibir apenas o Código de Cadastro ou o Nome nos documentos"
                        >
                          {exp.omitNameInDocuments ? 'Só Código Ativo' : 'Exibir Nome'}
                        </button>
                      </div>
                    </td>

                    {/* Contato Compacto */}
                    <td style={{
                      ...excelCellStyle,
                      fontSize: '11.5px',
                      color: 'var(--text-secondary)',
                      maxWidth: '210px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={`${exp.email || ''} ${exp.phone ? '• ' + exp.phone : ''}`.trim()}
                    >
                      {exp.phone || exp.email || '-'}
                    </td>

                    {/* Ações */}
                    <td style={{ ...excelCellStyle, textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(exp)}
                          className="btn btn-secondary"
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            height: '24px',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(exp.id)}
                          className="btn btn-danger"
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            height: '24px'
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredAndSorted.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      ...excelCellStyle,
                      textAlign: 'center',
                      padding: '28px',
                      color: 'var(--text-muted)',
                      fontWeight: '600'
                    }}
                  >
                    Nenhum exportador encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro / Edição */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 7, 15, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-panel"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              border: '1px solid var(--border-color)'
            }}
          >
            <h2 style={{ marginBottom: '16px', fontSize: '17px', fontFamily: 'var(--font-display)' }}>
              {editingExp ? 'Editar Exportador' : 'Novo Exportador'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label>Código de Cadastro *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="Ex: EXP-0001"
                    required
                    style={{ fontFamily: 'monospace', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label>Data de Cadastro *</label>
                  <input
                    type="date"
                    value={formData.registrationDate}
                    onChange={e => setFormData({ ...formData, registrationDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label>Nome do Exportador / Razão Social *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Café Atlântica Exportadora Ltda"
                  required
                />
              </div>

              <div>
                <label>CNPJ</label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={e => setFormData({ ...formData, cnpj: formatExporterCnpj(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  style={{ fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label>E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contato@empresa.com"
                  />
                </div>

                <div>
                  <label>Telefone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="omit-exporter-name-checkbox"
                  checked={Boolean(formData.omitNameInDocuments)}
                  onChange={e => setFormData({ ...formData, omitNameInDocuments: e.target.checked })}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label
                  htmlFor="omit-exporter-name-checkbox"
                  style={{ margin: 0, cursor: 'pointer', fontSize: '12px', lineHeight: '1.4', color: 'var(--text-primary)' }}
                >
                  <strong>Omitir nome do Exportador em documentos</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '400', marginTop: '2px' }}>
                    Quando ativado, certificados e relatórios exibirão apenas o Código de Cadastro (<strong>{formData.code || 'EXP-0001'}</strong>) no lugar do nome da empresa.
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
