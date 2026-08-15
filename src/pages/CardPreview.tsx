import React, { useState } from 'react';
import { Router, Cloud, RadioTower } from 'lucide-react';
import { StatusCard, HeroStatusCard } from '../components/tech-app/StatusCard';

/**
 * /card-preview — cena de referência (Imagem 1 "Network devices") reconstruída
 * 1:1 para aprovação de fidelidade do clone. Não faz parte do app; é o palco de
 * validação do StatusCard antes de aplicá-lo pelo sistema.
 */
export default function CardPreview() {
  const [tab, setTab] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#050506',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <style>{`@keyframes astrum-spin{to{transform:rotate(360deg)}}`}</style>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1200,
          minHeight: 680,
          borderRadius: 28,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          background: '#060607',
          display: 'grid',
          gridTemplateColumns: '44% 56%',
        }}
      >
        {/* ===== Coluna esquerda ===== */}
        <div
          style={{
            position: 'relative',
            padding: '46px 40px',
            borderRight: '1px solid rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}
        >
          {/* grade pontilhada de fundo */}
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '26px 26px', pointerEvents: 'none',
            }}
          />
          {/* brilho ambiente do canto inferior esquerdo — degradê AZUL→ROXO→ROSADO
              de uma ponta à outra, difuso e suavizado por máscara radial */}
          <span
            aria-hidden
            style={{
              position: 'absolute', left: -150, bottom: -170, width: 560, height: 520, pointerEvents: 'none',
              background:
                'linear-gradient(126deg, rgba(66,92,214,0.10) 0%, rgba(92,76,208,0.44) 34%, rgba(150,86,190,0.50) 64%, rgba(216,138,184,0.44) 100%)',
              filter: 'blur(50px)',
              WebkitMaskImage: 'radial-gradient(circle at 42% 66%, #000 0%, rgba(0,0,0,0.55) 46%, transparent 72%)',
              maskImage: 'radial-gradient(circle at 42% 66%, #000 0%, rgba(0,0,0,0.55) 46%, transparent 72%)',
            }}
          />

          <div style={{ position: 'relative' }}>
            <h1 style={{ color: '#f6f6f8', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              Network devices
            </h1>

            {/* segmented control */}
            <div
              style={{
                display: 'inline-flex', gap: 4, marginTop: 22, padding: 4,
                background: '#141416', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
              }}
            >
              {(['Daily', 'Weekly', 'Monthly'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '9px 18px', borderRadius: 10, fontSize: 15, fontWeight: 600,
                    background: tab === t ? '#2a2a30' : 'transparent',
                    color: tab === t ? '#f4f4f6' : '#6a6a70',
                    boxShadow: tab === t ? '0 1px 0 rgba(255,255,255,0.05) inset' : 'none',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* card flutuante em destaque */}
            <div style={{ marginTop: 70, marginRight: -70, maxWidth: 400 }}>
              <HeroStatusCard
                icon={<Router size={22} strokeWidth={2.2} />}
                iconColor="#F0648C"
                title="Routers"
                status="scheduled"
                trailing="in ~5 hrs"
              />
            </div>
          </div>
        </div>

        {/* ===== Coluna direita ===== */}
        <div style={{ padding: '40px 40px 40px 44px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionLabel>Today</SectionLabel>

          <StatusCard
            icon={<Router size={22} strokeWidth={2.2} />}
            iconColor="#F0648C"
            title="Routers"
            subtitle="Starts in ~5 hrs"
            status="scheduled"
          />
          <StatusCard
            icon={<Cloud size={22} strokeWidth={2.2} />}
            iconColor="#7C88F5"
            title="VPN Gateways"
            subtitle="Duration: 3 hrs"
            status="in_progress"
          />

          <SectionLabel style={{ marginTop: 10 }}>14 Oct.</SectionLabel>

          <StatusCard
            icon={<RadioTower size={22} strokeWidth={2.2} />}
            iconColor="#F0563E"
            title="IoT"
            status="completed"
            findings={[
              { value: '1', color: '#2E5BFF' },
              { value: '6', color: '#F5A524' },
              { value: '7', color: '#F97316' },
              { value: '4+', color: '#E5484D' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ color: '#6a6a70', fontSize: 16, fontWeight: 500, margin: 0, ...style }}>{children}</p>
  );
}
