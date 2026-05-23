export function maskCPF(cpf: string): string {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `***.***.${clean.slice(6, 9)}-**`; // e.g. ***.***.123-**
  }
  return '***.***.XXX-**';
}

export function maskPhone(phone: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(**) *****-${clean.slice(-4)}`; // e.g. (**) *****-1234
  } else if (clean.length >= 4) {
    return `(XX) XXXXX-` + '*'.repeat(4);
  }
  return '(XX) XXXXX-****';
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return 'p***@dominio.com';
  const [name, domain] = email.split('@');
  if (name.length > 1) {
    return `${name.charAt(0)}***@${domain}`;
  }
  return `*@${domain}`;
}
