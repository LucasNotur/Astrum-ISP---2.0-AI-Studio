/** @type {import('@stryker-mutator/core').StrykerOptions} */
export default {
  testRunner: 'vitest',
  testRunnerNodeArgs: [],
  vitest: {
    configFile: './vitest.stryker.config.ts',
  },
  mutate: [
    // Lógica de domínio pura — maior ROI para mutation testing
    'src/domain/agent/nodes/classify.node.ts',
    'src/domain/agent/nodes/guardrails.node.ts',
    'src/domain/agent/nodes/decide-source.node.ts',
    'src/domain/agent/nodes/fetch-context.node.ts',
    'src/domain/agent/nodes/generate.node.ts',
    'src/domain/agent/nodes/validate.node.ts',
    'src/domain/agent/nodes/escalate.node.ts',
    'src/domain/agent/nodes/block.node.ts',
    // Funções puras de cobrança
    'src/domain/cobranca/cobrai-rules.service.ts',
    // Serviço de conversação (puro)
    'src/domain/atendimento/conversation.service.ts',
  ],
  testFiles: [
    'src/domain/agent/nodes/*.test.ts',
    'src/domain/cobranca/cobrai-rules.service.test.ts',
    'src/domain/atendimento/conversation.service.test.ts',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/report.html',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  coverageAnalysis: 'perTest',
  timeoutMS: 30000,
  concurrency: 4,
  disableTypeChecks: true,
};
