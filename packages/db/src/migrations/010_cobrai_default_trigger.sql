-- Trigger para criar regras CobrAI padrão em novos tenants
CREATE OR REPLACE FUNCTION create_default_cobrai_rules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cobrai_rules (tenant_id, name, days_overdue, action, message_template, active)
  VALUES
    (NEW.id, 'Lembrete D+1', 1, 'send_message',
     'Olá {{customerName}}! Sua fatura de R$ {{amountBRL}} venceu. Regularize: {{paymentLink}}', true),
    (NEW.id, 'Aviso D+5', 5, 'send_message',
     'Atenção {{customerName}}, 5 dias em aberto. Pague para evitar suspensão: {{paymentLink}}', true),
    (NEW.id, 'Suspensão D+10', 10, 'suspend_signal', NULL, true),
    (NEW.id, 'Notificar Operador D+30', 30, 'notify_human',
     'Cliente {{customerName}} com {{daysOverdue}} dias inadimplente.', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_tenant_created ON tenants;

CREATE TRIGGER after_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_default_cobrai_rules();

COMMENT ON TRIGGER after_tenant_created ON tenants IS
  'Cria regras CobrAI padrão automaticamente ao cadastrar novo tenant.';
