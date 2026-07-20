import { defineConfig } from 'cypress';
import { setupXReport } from '@xqa.io/xreport/cypress';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      setupXReport(on, config, {
        reportTitle: 'Cypress · XREPORT sample',
        reportDir: './xreport',
        enableHistory: true,
        historyOptions: { saveFullResults: true },
        branding: {
          projectName: 'XREPORT',
          companyName: 'XQA',
          website: 'https://xqa.io',
        },
      });
      return config;
    },
    screenshotOnRunFailure: true,
    video: true,
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
  },
});
