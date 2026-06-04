import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface CobraiRule {
  id: string;
  daysAfterDue: number;
  channel: 'whatsapp' | 'sms' | 'email';
  template: string;
  active: boolean;
}

interface CobraiState {
  rules: CobraiRule[];
  isLoading: boolean;

  setRules: (rules: CobraiRule[]) => void;

  // Optimistic toggle de regra
  toggleRuleOptimistic: (ruleId: string) => boolean; // retorna estado ANTERIOR
  rollbackRuleToggle: (ruleId: string, previousState: boolean) => void;
  confirmRuleToggle: (ruleId: string) => void;
}

export const useCobraiStore = create<CobraiState>()(
  immer((set, get) => ({
    rules: [],
    isLoading: false,

    setRules: (rules) => set((state) => { state.rules = rules as any; }),

    toggleRuleOptimistic: (ruleId) => {
      const rule = get().rules.find(r => r.id === ruleId);
      const previousActive = rule?.active ?? false;

      set((state) => {
        const r = state.rules.find(r => r.id === ruleId);
        if (r) r.active = !r.active;
      });

      return previousActive;
    },

    rollbackRuleToggle: (ruleId, previousState) => set((state) => {
      const r = state.rules.find(r => r.id === ruleId);
      if (r) r.active = previousState;
    }),

    confirmRuleToggle: (ruleId) => {
      // Nada a fazer — já está correto otimisticamente
    },
  })),
);
