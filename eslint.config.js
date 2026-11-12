import js from '@eslint/js';
import globals from 'globals';

// The game core (rules and state) must run without a browser and must not reach up into the UI.
// It talks to the UI only through core/events.js. See docs/GAME.md, "Layers".
const CORE = ['src/core/**/*.js', 'src/world/**/*.js', 'src/space/**/*.js', 'src/sim/**/*.js'];

export default [
  { ignores: ['node_modules/', 'coverage/', '_site/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    ignores: CORE,
    languageOptions: { globals: globals.browser },
  },
  {
    files: CORE,
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/*', '**/actions/*', '**/main.js'],
              message: 'The core must not import UI code. Emit an event from core/events.js instead.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Use random() from core/rng.js (seeded), or fxRandom() for visuals that never change game state.',
        },
      ],
    },
  },
  {
    files: ['src/core/rng.js'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
