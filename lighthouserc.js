module.exports = {
  ci: {
    collect: {
      staticDistDir: './public',
      url: ['http://localhost/index.html', 'http://localhost/demo.html'],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        'installable-manifest': 'error',
        'service-worker': 'error',
        'works-offline': 'error',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
