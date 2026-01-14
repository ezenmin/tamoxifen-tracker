module.exports = {
  ci: {
    collect: {
      staticDistDir: './public',
      url: ['http://localhost/index.html', 'http://localhost/demo.html'],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        // PWA audit categories (Lighthouse 12+)
        'categories:pwa': ['error', { minScore: 0.5 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
