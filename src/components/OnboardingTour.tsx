import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { ONBOARDING_STEPS, onboardingKey } from '@/src/lib/onboarding-steps';
import { cn } from '@/src/lib/utils';

interface Props {
  role: string;
  tenantId: string;
}

export function OnboardingTour({ role, tenantId }: Props) {
  const key = onboardingKey(tenantId, role);
  const steps = ONBOARDING_STEPS[role] ?? ONBOARDING_STEPS['support'];

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {}
  }, [key]);

  const finish = () => {
    try { localStorage.setItem(key, '1'); } catch {}
    setOpen(false);
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-4">
          {/* Step counter */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">{step + 1} de {steps.length}</span>
            <button
              onClick={finish}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              Pular tour
            </button>
          </div>

          {/* Icon + title */}
          <div className="text-center space-y-3">
            <div className="text-5xl">{current.icon}</div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{current.title}</h2>
          </div>

          {/* Description */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center leading-relaxed">
            {current.description}
          </p>

          {/* Hint */}
          {current.hint && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
              <p className="text-xs text-primary font-medium flex items-start gap-2">
                <span className="shrink-0 mt-0.5">💡</span>
                {current.hint}
              </p>
            </div>
          )}

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 pt-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300'
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
            >
              Anterior
            </Button>
            {isLast ? (
              <Button size="sm" onClick={finish}>
                Começar a usar 🚀
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Próximo →
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
