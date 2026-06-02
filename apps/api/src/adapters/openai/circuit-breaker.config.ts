export const OPENAI_CIRCUIT_BREAKER_CONFIG = {
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
} as const;

export const WHATSAPP_CIRCUIT_BREAKER_CONFIG = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 20000,
  volumeThreshold: 3,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
} as const;
