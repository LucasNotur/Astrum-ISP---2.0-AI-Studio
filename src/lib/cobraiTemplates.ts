export const COBRAI_TEMPLATES: Record<string, any> = {
  D_MINUS_5: {
    templateName: 'cobrai_aviso_vencimento',
    language: 'pt_BR',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', key: 'customer_name' },
        { type: 'text', key: 'due_date' },
        { type: 'text', key: 'amount' },
        { type: 'text', key: 'plan_name' }
      ]
    }]
  },
  D_ZERO: {
    templateName: 'cobrai_dia_vencimento',
    language: 'pt_BR',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', key: 'customer_name' },
        { type: 'text', key: 'due_date' },
        { type: 'text', key: 'amount' }
      ]
    }]
  },
  D_PLUS_3: {
    templateName: 'cobrai_pos_vencimento',
    language: 'pt_BR',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', key: 'customer_name' },
        { type: 'text', key: 'due_date' },
        { type: 'text', key: 'amount' }
      ]
    }]
  },
  D_PLUS_15: {
    templateName: 'cobrai_suspensao_aviso',
    language: 'pt_BR',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', key: 'customer_name' },
        { type: 'text', key: 'due_date' }
      ]
    }]
  },
  D_PLUS_30: {
    templateName: 'cobrai_negociacao',
    language: 'pt_BR',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', key: 'customer_name' },
        { type: 'text', key: 'amount' }
      ]
    }]
  }
};
