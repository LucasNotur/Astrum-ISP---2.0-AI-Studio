module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['http://localhost/index.html'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85 }],
        'categories:accessibility': ['error', { minScore: 0.90 }],
        'categories:best-practices': ['warn', { minScore: 0.80 }],
        'categories:seo': ['warn', { minScore: 0.70 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
