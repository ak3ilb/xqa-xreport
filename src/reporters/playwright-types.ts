/** Loose Playwright reporter types so @playwright/test stays optional at install time */
export interface FullConfig {
  [key: string]: unknown;
}

export interface FullResult {
  status: 'passed' | 'failed' | 'timedout' | 'interrupted';
}

export interface Location {
  file: string;
  line: number;
  column?: number;
}

export interface TestError {
  message?: string;
  stack?: string;
  value?: unknown;
}

export interface TestStep {
  title: string;
  category?: string;
  duration: number;
  error?: TestError;
  steps?: TestStep[];
}

export interface TestAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: Buffer;
}

export interface TestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  errors: TestError[];
  attachments: TestAttachment[];
  steps?: TestStep[];
  startTime?: Date | string;
  stdout?: Array<{ text?: string } | string>;
  stderr?: Array<{ text?: string } | string>;
  workerIndex?: number;
  parallelIndex?: number;
  retry?: number;
}

export interface TestCase {
  id: string;
  title: string;
  tags?: string[];
  annotations?: Array<{ type: string; description?: string }>;
  location: Location;
  titlePath(): string[];
  outcome(): 'skipped' | 'expected' | 'unexpected' | 'flaky';
  retries?: number;
}

export interface Suite {
  title: string;
  suites: Suite[];
  tests: TestCase[];
  location?: Location;
  allTests(): TestCase[];
}

export interface Reporter {
  onBegin?(config: FullConfig, suite: Suite): void;
  onTestEnd?(test: TestCase, result: TestResult): void;
  onEnd?(result: FullResult): void | Promise<void>;
  printsToStdio?(): boolean;
}
