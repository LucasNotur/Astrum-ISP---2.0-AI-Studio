import React, { useCallback, useState } from 'react';
import { useDocuments, useUploadDocument, useDeleteDocument } from '../hooks/useDocuments';

const ALLOWED_TYPES = ['.pdf', '.txt', '.md', '.docx'];
const MAX_SIZE_MB = 10;

function FileStatusBadge({ status }: { status: string }) {
  const config = {
    processing: { label: 'Indexando...', color: '#eab308', pulse: true },
    indexed:    { label: 'Indexado ✓', color: '#22c55e', pulse: false },
    failed:     { label: 'Falhou ✗', color: '#ef4444', pulse: false },
  }[status] ?? { label: status, color: '#6b7280', pulse: false };

  return (
    <span
      className={`status-badge ${config.pulse ? 'status-pulse' : ''}`}
      style={{ color: config.color, borderColor: config.color }}
    >
      {config.label}
    </span>
  );
}

export default function Knowledge() {
  const { data: docs, isLoading } = useDocuments();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(ext)) {
      setUploadError(`Tipo não permitido. Use: ${ALLOWED_TYPES.join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`Arquivo muito grande. Máximo: ${MAX_SIZE_MB}MB`);
      return;
    }

    await uploadMutation.mutateAsync(file);
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = ''; // reset para permitir re-upload do mesmo arquivo
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Base de Conhecimento</h1>
          <p className="page-subtitle">
            Documentos usados pela IA para responder perguntas técnicas dos seus clientes.
          </p>
        </div>
      </header>

      {/* Zona de Upload */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploadMutation.isPending ? 'uploading' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="region"
        aria-label="Área de upload de documentos"
      >
        <input
          type="file"
          id="file-upload"
          className="file-input-hidden"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleInputChange}
          disabled={uploadMutation.isPending}
        />
        <label htmlFor="file-upload" className="upload-label">
          {uploadMutation.isPending ? (
            <>
              <div className="upload-spinner" />
              <span>Enviando e indexando...</span>
            </>
          ) : (
            <>
              <span className="upload-icon">📄</span>
              <span className="upload-text">
                {dragOver ? 'Solte o arquivo aqui' : 'Arraste ou clique para fazer upload'}
              </span>
              <span className="upload-hint">
                PDF, TXT, MD, DOCX — Máximo {MAX_SIZE_MB}MB
              </span>
            </>
          )}
        </label>
      </div>

      {uploadError && <p className="form-error" role="alert">{uploadError}</p>}

      {/* Lista de Documentos */}
      <section aria-label="Documentos indexados">
        <h2 className="section-title">
          Documentos ({docs?.length ?? 0})
        </h2>

        {isLoading ? (
          <div className="doc-list">
            {[1,2,3].map(i => <div key={i} className="doc-row skeleton" style={{height:'56px'}} />)}
          </div>
        ) : docs?.length === 0 ? (
          <div className="empty-state">
            <p>📂 Nenhum documento ainda.</p>
            <p className="text-muted">Faça upload de manuais técnicos para que a IA possa responder perguntas específicas do seu ISP.</p>
          </div>
        ) : (
          <div className="doc-list">
            {docs?.map(doc => (
              <div key={doc.id} className="doc-row">
                <div className="doc-icon">
                  {doc.file_type === 'pdf' ? '📕' : doc.file_type === 'md' ? '📝' : '📄'}
                </div>
                <div className="doc-info">
                  <span className="doc-name">{doc.filename}</span>
                  <span className="doc-meta">
                    {doc.status === 'indexed' && `${doc.chunks_count} chunks`}
                    {doc.status === 'failed' && doc.error_message}
                  </span>
                </div>
                <FileStatusBadge status={doc.status} />
                <button
                  className="btn-icon btn-danger"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Remover ${doc.filename}`}
                  title="Remover documento"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
