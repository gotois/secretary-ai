import globals from 'globals';

export default [{
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    globals: {
      ...globals.browser,
      myCustomGlobal: 'readonly'
    }
  },
  rules: {
    'linebreak-style': ['error', 'unix'],
    'dot-location': ['error', 'property'],
    'array-bracket-spacing': ['error', 'never'],
    'block-spacing': ['error', 'always'],
    'brace-style': ['error', '1tbs', {'allowSingleLine': true}],
    'comma-spacing': 'error',
    'comma-style': 'error',
    'computed-property-spacing': 'error',
    'consistent-this': ['error', 'self'],
    'eol-last': 'error',
    'func-call-spacing': 'error',
    'key-spacing': 'error',
    'keyword-spacing': 'error',
    'max-depth': 'warn',
    'max-len': ['error', {
      'ignoreComments': true,
      'tabWidth': 2,
      'comments': 140,
      'ignoreTemplateLiterals': true,
      'ignoreTrailingComments': true,
      'ignoreUrls': true,
      'code': 120
    }],
    'new-parens': 'error',
    'no-lonely-if': 'error',
    'no-multiple-empty-lines': 'error',
    'no-nested-ternary': 'error',
    'no-unneeded-ternary': 'error',
    'no-whitespace-before-property': 'error',
    'object-property-newline': ['error', {'allowMultiplePropertiesPerLine': true}],
    'semi-spacing': 'error',
    'space-before-blocks': 'error',
    'space-in-parens': 'error',
    'space-unary-ops': 'error',
    'unicode-bom': 'error',
    'arrow-spacing': 'error',
    'no-duplicate-imports': 'error',
    'constructor-super': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-eq-null': 'error',
    'no-global-assign': 'error',
    'no-invalid-this': 'error',
    'no-loop-func': 'error',
    'no-multi-spaces': 'error',
    'no-return-assign': ['error', 'always'],
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-useless-escape': 'error',
    'no-undef-init': 'error',
    'one-var': ['error', 'never'],
    'indent': [
      'error',
      2,
      {
        'SwitchCase': 1,
        'VariableDeclarator': 0,
        'MemberExpression': 1
      }
    ],
    'quotes': [
      'error',
      'single'
    ],
    'semi': [
      'error',
      'always'
    ],
    'no-unused-vars': [
      'error',
      {
        'varsIgnorePattern': '^_',
        'argsIgnorePattern': '^_'
      }
    ],
    'require-await': 'error',
    'no-return-await': 'error',
    'arrow-body-style': ['error', 'always'],
    'prefer-destructuring': ['error', {
      'array': true,
      'object': false
    }, {
      'enforceForRenamedProperties': false
    }],
    'comma-dangle': ['error', 'only-multiline'],
    'prefer-arrow-callback': 'error',
    'curly': [
      'error',
      'all'
    ],
    'no-console': 'warn'
  }
}];
