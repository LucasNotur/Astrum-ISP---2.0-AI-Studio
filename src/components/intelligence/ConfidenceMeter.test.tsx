import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceMeter } from './ConfidenceMeter';

describe('ConfidenceMeter', () => {
  it('exibe 80% em verde para valor 0.8', () => {
    render(<ConfidenceMeter value={0.8} />);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  it('clampa valor acima de 1', () => {
    render(<ConfidenceMeter value={1.5} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('clampa valor abaixo de 0', () => {
    render(<ConfidenceMeter value={-0.2} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
