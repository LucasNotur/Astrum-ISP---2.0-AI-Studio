import React from 'react';

interface DataPoint {
  date: string;
  total: number;
  ai_responses: number;
}

interface Props {
  data: DataPoint[];
  loading?: boolean;
}

/**
 * Gráfico de barras simples — sem biblioteca externa.
 * Barras empilhadas: total vs respostas da IA.
 */
export function MessageVolumeChart({ data, loading }: Props) {
  if (loading) return <div className="chart-skeleton skeleton" />;
  if (!data || data.length === 0) {
    return <div className="chart-empty">Sem dados para o período selecionado.</div>;
  }

  const maxValue = Math.max(...data.map(d => d.total), 1);

  return (
    <div className="chart-container">
      <h3 className="chart-title">Volume de Mensagens</h3>
      <div className="bar-chart" role="img" aria-label="Gráfico de volume de mensagens">
        {data.slice(-14).map((point, i) => {
          const heightPct = (point.total / maxValue) * 100;
          const aiPct = point.total > 0 ? (point.ai_responses / point.total) * 100 : 0;

          return (
            <div
              key={point.date}
              className="bar-group"
              title={`${point.date}: ${point.total} mensagens (${Math.round(aiPct)}% IA)`}
            >
              <div className="bar-wrapper" style={{ height: '160px' }}>
                <div
                  className="bar bar-total"
                  style={{ height: `${heightPct}%` }}
                >
                  <div
                    className="bar-ai"
                    style={{ height: `${aiPct}%` }}
                  />
                </div>
              </div>
              <span className="bar-label">
                {new Date(point.date).getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="chart-legend">
        <span className="legend-item"><span className="legend-dot dot-total" />Total</span>
        <span className="legend-item"><span className="legend-dot dot-ai" />IA</span>
      </div>
    </div>
  );
}
