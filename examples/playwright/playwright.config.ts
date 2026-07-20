import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['../../dist/reporters/playwright.js', {
      reportTitle: 'XREPORT Demo · XQA',
      reportDir: './xreport',
      exportCSV: true,
      exportCtrf: true,
      autoOpen: false,
      branding: {
        projectName: 'XREPORT',
        companyName: 'XQA',
        website: 'https://xqa.io',
        accentColor: '#0071E3',
      },
    }],
  ],
});
