/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  reporters: [
    'default',
    [
      '@xqa.io/xreport/jest',
      {
        reportTitle: 'Jest · XREPORT sample',
        reportDir: './xreport',
        enableHistory: true,
        historyOptions: { saveFullResults: true },
        branding: {
          projectName: 'XREPORT',
          companyName: 'XQA',
          website: 'https://xqa.io',
        },
      },
    ],
  ],
};
