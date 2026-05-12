export function buildTemplateComponents(template: any, customer: any, invoice: any) {
  const builtComponents = [];

  for (const comp of template.components) {
    const builtParameters = [];
    for (const param of comp.parameters) {
      if (param.type === 'text') {
        let textValue = '';
        switch (param.key) {
          case 'customer_name':
            textValue = customer.name || 'Cliente';
            break;
          case 'due_date':
            textValue = invoice?.due_date || 'N/A';
            break;
          case 'amount':
            textValue = invoice?.amount ? `R$ ${parseFloat(invoice.amount.toString()).toFixed(2)}` : 'R$ 0,00';
            break;
          case 'plan_name':
            textValue = customer.current_contract_version || 'Plano Atual';
            break;
        }
        builtParameters.push({ type: 'text', text: textValue });
      }
    }
    builtComponents.push({
      type: comp.type,
      parameters: builtParameters
    });
  }

  return builtComponents;
}
