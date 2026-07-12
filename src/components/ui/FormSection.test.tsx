import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormSection } from './FormSection';

describe('FormSection', () => {
  it('renderiza título da seção', () => {
    render(
      <FormSection title="Dados pessoais">
        <input />
      </FormSection>,
    );
    expect(screen.getByText('Dados pessoais')).toBeInTheDocument();
  });

  it('renderiza descrição quando fornecida', () => {
    render(
      <FormSection title="Endereço" description="Endereço de instalação do cliente">
        <input />
      </FormSection>,
    );
    expect(screen.getByText('Endereço de instalação do cliente')).toBeInTheDocument();
  });

  it('não renderiza descrição quando ausente', () => {
    const { container } = render(
      <FormSection title="Seção">
        <input />
      </FormSection>,
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it('renderiza filhos', () => {
    render(
      <FormSection title="Contato">
        <input placeholder="Telefone" />
        <input placeholder="E-mail" />
      </FormSection>,
    );
    expect(screen.getByPlaceholderText('Telefone')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('E-mail')).toBeInTheDocument();
  });

  it('usa elemento section semântico', () => {
    const { container } = render(
      <FormSection title="Seção">
        <span>x</span>
      </FormSection>,
    );
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('aplica className extra', () => {
    const { container } = render(
      <FormSection title="S" className="mt-6">
        <span>x</span>
      </FormSection>,
    );
    expect(container.querySelector('section')).toHaveClass('mt-6');
  });
});
