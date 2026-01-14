module.exports = {
  ci: {
    collect: {
      staticDistDir: './public',
      url: ['http://localhost/index.html', 'http://localhost/demo.html'],
      numberOfRuns: 1,
      settings: {
        // Run PWA audits
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
      },
    },
    assert: {
      assertions: {
        // PWA category minimum score
        'categories:pwa': ['warn', { minScore: 0.5 }],
        // Performance shouldn't be too bad
        'categories:performance': ['warn', { minScore: 0.5 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
