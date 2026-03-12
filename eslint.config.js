import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'test/**', 'out/**'],
  },
  {
    files: ['src/**/*.js'],
    plugins: {
      security,
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      // Security plugin rules — all as warnings
      ...Object.fromEntries(
        Object.keys(security.rules).map(rule => [`security/${rule}`, 'warn'])
      ),
      // no-unsanitized rules — as warnings
      'no-unsanitized/property': 'warn',
      'no-unsanitized/method': 'warn',
    },
  },
];
