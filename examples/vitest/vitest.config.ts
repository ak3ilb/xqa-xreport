import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      [
        '@xqa.io/xreport/vitest',
        {
          reportTitle: 'Vitest · XREPORT sample',
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
  },
});
