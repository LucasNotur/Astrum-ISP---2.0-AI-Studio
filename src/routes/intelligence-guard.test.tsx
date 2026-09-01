import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock do hook de flags — controlado por teste.
let mockFlags: Record<string, boolean> = {};
let mockLoading = false;
vi.mock('@/src/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: mockFlags, isLoading: mockLoading }),
}));

import { G } from './intelligence.routes';

function renderAt(path: string, child = <div>PAGE</div>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<G>{child}</G>} />
        <Route path="/home" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F3-01 — guard de rota do lab de Inteligência', () => {
  beforeEach(() => { mockFlags = {}; mockLoading = false; });

  it('redireciona pra /home quando a flag da branch está off', () => {
    renderAt('/intelligence/drift');
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.queryByText('PAGE')).not.toBeInTheDocument();
  });

  it('renderiza a página quando a flag está on', () => {
    mockFlags = { drift: true };
    renderAt('/intelligence/drift');
    expect(screen.getByText('PAGE')).toBeInTheDocument();
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });

  it('deixa o hub passar (rota sem flag no mapa)', () => {
    renderAt('/intelligence');
    expect(screen.getByText('PAGE')).toBeInTheDocument();
  });

  it('não vaza durante o loading das flags (fail-closed, não redireciona nem mostra)', () => {
    mockLoading = true;
    renderAt('/intelligence/sandbox');
    expect(screen.queryByText('PAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });
});
