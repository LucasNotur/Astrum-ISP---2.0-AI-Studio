import { describe, it, expect } from 'vitest';
import { checkPermission } from './rbac.middleware';

describe('RBAC — Controle de Acesso por Role', () => {
  it('super_admin tem acesso a tudo', () => {
    expect(checkPermission('super_admin', 'billing', 'delete')).toBe(true);
    expect(checkPermission('super_admin', 'ai_config', 'admin')).toBe(true);
  });

  it('admin pode ler e escrever tickets', () => {
    expect(checkPermission('admin', 'tickets', 'read')).toBe(true);
    expect(checkPermission('admin', 'tickets', 'write')).toBe(true);
    expect(checkPermission('admin', 'tickets', 'delete')).toBe(true);
  });

  it('operator não pode deletar tickets', () => {
    expect(checkPermission('operator', 'tickets', 'read')).toBe(true);
    expect(checkPermission('operator', 'tickets', 'delete')).toBe(false);
  });

  it('viewer não pode escrever em nada', () => {
    expect(checkPermission('viewer', 'tickets', 'write')).toBe(false);
    expect(checkPermission('viewer', 'customers', 'write')).toBe(false);
    expect(checkPermission('viewer', 'billing', 'read')).toBe(false);
  });

  it('operator não acessa ai_config', () => {
    expect(checkPermission('operator', 'ai_config', 'read')).toBe(false);
  });

  it('admin pode configurar IA mas operator não', () => {
    expect(checkPermission('admin', 'ai_config', 'write')).toBe(true);
    expect(checkPermission('operator', 'ai_config', 'write')).toBe(false);
  });
});
