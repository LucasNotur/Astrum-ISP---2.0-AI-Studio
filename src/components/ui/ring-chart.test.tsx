import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RingChart, RingLegend, ASTRUM_SEMANTIC } from './ring-chart';

/** D-015 — o anel é o padrão global de composição; a matemática do arco precisa
 *  aguentar os casos de borda (fatia única de 100%, zeros, sem dados). */
describe('RingChart', () => {
  const seg = (value: number, color: string, label: string) => ({ value, color, label, icon: <i data-testid="src-icon" /> });

  it('desenha um arco por fatia com valor > 0 e ignora as zeradas', () => {
    const { container } = render(
      <RingChart
        segments={[seg(3, ASTRUM_SEMANTIC.ok, 'Pagas'), seg(0, ASTRUM_SEMANTIC.warn, 'Pendentes'), seg(1, ASTRUM_SEMANTIC.bad, 'Atrasadas')]}
        centerValue="4"
        centerLabel="faturas"
      />
    );
    // trilho (circle) + 2 arcos (path) — a fatia zerada não vira arco
    expect(container.querySelectorAll('path').length).toBe(2);
    expect(container.querySelectorAll('[data-testid="src-icon"]').length).toBe(2);
  });

  it('usa um círculo (não um path) quando uma fatia representa 100%', () => {
    // um arco de 0°→360° tem início e fim no mesmo ponto: o SVG não desenharia nada
    const { container } = render(
      <RingChart segments={[seg(10, ASTRUM_SEMANTIC.ok, 'Tudo')]} centerValue="10" />
    );
    expect(container.querySelectorAll('path').length).toBe(0);
    // trilho + fatia completa
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('não quebra sem dados e mantém o total no centro', () => {
    const { container, getByText } = render(
      <RingChart segments={[seg(0, ASTRUM_SEMANTIC.ok, 'Nada')]} centerValue="0" centerLabel="sem dados" />
    );
    expect(container.querySelectorAll('path').length).toBe(0);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('sem dados')).toBeTruthy();
  });

  it('gera coordenadas finitas no gradiente de cada fatia', () => {
    const { container } = render(
      <RingChart segments={[seg(1, ASTRUM_SEMANTIC.ok, 'A'), seg(1, ASTRUM_SEMANTIC.bad, 'B')]} centerValue="2" />
    );
    const grads = container.querySelectorAll('linearGradient');
    expect(grads.length).toBe(2);
    grads.forEach((g) => {
      ['x1', 'y1', 'x2', 'y2'].forEach((attr) => {
        expect(Number.isFinite(Number(g.getAttribute(attr)))).toBe(true);
      });
    });
  });
});

describe('RingLegend', () => {
  it('lista os itens com rótulo e valor', () => {
    const { getByText } = render(
      <RingLegend items={[{ label: 'Pagas', value: '3', sub: 'ciclo atual' }]} />
    );
    expect(getByText('Pagas')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('ciclo atual')).toBeTruthy();
  });

  it('mostra estado vazio quando não há itens', () => {
    const { getByText } = render(<RingLegend items={[]} />);
    expect(getByText(/Sem dados no período/i)).toBeTruthy();
  });
});
