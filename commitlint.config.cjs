module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'scope-enum': [
      1,
      'always',
      ['api', 'web', 'core', 'mexc', 'risk', 'engine', 'db', 'ci', 'docs', 'deps', 'repo'],
    ],
  },
};
