/**
 * Cypress support helpers — import from `cypress/support/e2e.ts`:
 *
 * ```ts
 * import { registerXReportCypress } from '@xqa.io/xreport/cypress/support';
 * registerXReportCypress();
 * ```
 *
 * Requires `setupXReport(on, config, opts)` in `cypress.config.ts` (registers `cy.task` handlers).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Step = {
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  category?: string;
};

declare const Cypress: any;
declare const cy: any;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;

function titleKey(): string {
  try {
    const path = Cypress.currentTest?.titlePath;
    if (Array.isArray(path) && path.length) return path.join(' › ');
    const t = Cypress.currentTest?.title;
    if (t) return String(t);
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Collect Cypress command log as Steps + optional notes via `cy.xreportNote`.
 */
export function registerXReportCypress(options: { commandLog?: boolean } = {}): void {
  const commandLog = options.commandLog !== false;
  let steps: Step[] = [];

  beforeEach(() => {
    steps = [];
  });

  if (commandLog) {
    Cypress.on('command:end', (command: any) => {
      try {
        const name = command?.attributes?.name;
        if (!name || name === 'then' || name === 'wrap' || name === 'xreportNote' || name === 'xreportMeta') {
          return;
        }
        const failed = command?.state === 'failed';
        steps.push({
          title: name + (command?.attributes?.message ? ` ${command.attributes.message}` : ''),
          status: failed ? 'failed' : 'passed',
          duration: 0,
          category: 'cy:command',
        });
      } catch {
        /* ignore */
      }
    });
  }

  Cypress.Commands.add('xreportNote', (value: unknown, title = 'Note') => {
    const key = titleKey();
    return cy.task(
      'xreport:attach',
      {
        key,
        attachment: {
          type: typeof value === 'object' ? 'json' : 'text',
          title,
          value,
        },
      },
      { log: false },
    );
  });

  Cypress.Commands.add(
    'xreportMeta',
    (meta: { owner?: string; severity?: string; labels?: Record<string, string> }) => {
      const key = titleKey();
      return cy.task('xreport:meta', { key, meta }, { log: false });
    },
  );

  afterEach(() => {
    const key = titleKey();
    if (!key) return;
    cy.task('xreport:steps', { key, steps: [...steps] }, { log: false });
  });
}

export default registerXReportCypress;
module.exports = registerXReportCypress;
module.exports.registerXReportCypress = registerXReportCypress;
module.exports.default = registerXReportCypress;
