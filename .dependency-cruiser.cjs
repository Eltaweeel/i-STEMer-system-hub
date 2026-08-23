// Dependency-cruiser enforces the boundary:
//   packages/core/** must not import from apps/** or test-fixtures/**.
// Proven-to-fire command (documented in packages/core/__tests__/guards-prove-themselves.test.ts):
//   Introduce a temp file at packages/core/contracts/src/__probe.ts that imports
//   '../../../../apps/istemer-demo/tenant/tenant.config' and run:
//     npx depcruise --config .dependency-cruiser.cjs packages
//   depcruise exits non-zero with `error core-must-not-import-apps`.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-must-not-import-apps',
      severity: 'error',
      comment:
        'packages/core defines the contract; apps conform to it. An import in the other direction inverts the boundary.',
      from: { path: '^packages/core' },
      to: { path: '^(apps|test-fixtures)/' },
    },
    {
      name: 'core-must-not-import-app-package',
      severity: 'error',
      comment: 'Also block resolved app package names.',
      from: { path: '^packages/core' },
      to: { path: '@istemer/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(node_modules|\\.next|out|dist|docs/reference|apps/istemer-demo/data/agents)',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
