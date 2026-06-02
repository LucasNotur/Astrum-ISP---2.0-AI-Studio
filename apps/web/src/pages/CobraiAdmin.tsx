import React, { useState } from 'react';
import { useCobraiRules, useToggleCobraiRule, useUpdateCobraiRule } from '../hooks/useCobraiRules';

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  send_message:   { label: 'Enviar Mensagem', icon: '💬', color: '#3b82f6' },
  suspend_signal: { label: 'Suspender Sinal', icon: '🔴', color: '#ef4444' },
  reactivate:     { label: 'Reativar',        icon: '✅', color: '#22c55e' },
  notify_human:   { label: 'Notificar Equipe',icon: '👤', color: '#a855f7' },
};

const TEMPLATE_VARS = ['{{customerName}}', '{{amountBRL}}', '{{daysOverdue}}', '{{paymentLink}}'];

export default function CobraiAdmin() {
  const { data: rules, isLoading } = useCobraiRules();
  const toggleRule = useToggleCobraiRule();
  const updateRule = useUpdateCobraiRule();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState('');

  const startEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditingTemplate(rule.message_template ?? '');
  };

  const saveEdit = (id: string) => {
    updateRule.mutate({ id, template: editingTemplate });
    setEditingId(null);
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>CobrAI — Régua de Cobrança</h1>
          <p className="page-subtitle">Configure as mensagens automáticas por dias de atraso.</p>
        </div>
      </header>

      <div className="cobrai-timeline" aria-label="Régua de cobrança">
        {isLoading ? (
          [1,2,3,4].map(i => <div key={i} className="cobrai-card skeleton" style={{height:'120px'}} />)
        ) : (
          rules?.sort((a, b) => a.days_overdue - b.days_overdue).map((rule, idx) => {
            const action = ACTION_LABELS[rule.action];
            const isEditing = editingId === rule.id;

            return (
              <div key={rule.id} className={`cobrai-card ${!rule.active ? 'cobrai-inactive' : ''}`}>
                {/* Timeline dot */}
                {idx < (rules.length - 1) && <div className="timeline-line" />}
                <div className="timeline-dot" style={{ background: action.color }} />

                <div className="cobrai-card-content">
                  <div className="cobrai-header">
                    <div className="cobrai-day-badge">
                      <span>D+{rule.days_overdue}</span>
                    </div>
                    <div className="cobrai-action">
                      <span>{action.icon}</span>
                      <span style={{ color: action.color }}>{action.label}</span>
                    </div>
                    <div className="cobrai-controls">
                      {rule.message_template && !isEditing && (
                        <button className="btn-icon" onClick={() => startEdit(rule)} title="Editar template">
                          ✏️
                        </button>
                      )}
                      <label className="toggle" title={rule.active ? 'Desativar' : 'Ativar'}>
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={e => toggleRule.mutate({ id: rule.id, active: e.target.checked })}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  {rule.message_template && !isEditing && (
                    <p className="cobrai-template">{rule.message_template}</p>
                  )}

                  {isEditing && (
                    <div className="template-editor">
                      <textarea
                        className="template-textarea"
                        value={editingTemplate}
                        onChange={e => setEditingTemplate(e.target.value)}
                        rows={3}
                        aria-label="Template da mensagem"
                      />
                      <div className="template-vars">
                        <span className="vars-label">Variáveis:</span>
                        {TEMPLATE_VARS.map(v => (
                          <button
                            key={v}
                            className="var-chip"
                            onClick={() => setEditingTemplate(t => t + v)}
                            type="button"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <div className="template-actions">
                        <button className="btn-sm btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
                        <button className="btn-sm btn-primary" onClick={() => saveEdit(rule.id)}>Salvar</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
