import * as assert from "assert";

type AsyncTestFunction = () => void | Promise<void>;

interface TestCase {
  name: string;
  fn: AsyncTestFunction;
}

interface SuiteNode {
  name: string;
  suites: SuiteNode[];
  tests: TestCase[];
  setupHooks: AsyncTestFunction[];
  teardownHooks: AsyncTestFunction[];
  parent?: SuiteNode;
}

const rootSuite: SuiteNode = createSuite("(root)");
let currentSuite = rootSuite;

function createSuite(name: string, parent?: SuiteNode): SuiteNode {
  return {
    name,
    suites: [],
    tests: [],
    setupHooks: [],
    teardownHooks: [],
    parent,
  };
}

function suite(name: string, register: () => void): void {
  const parent = currentSuite;
  const child = createSuite(name, parent);
  parent.suites.push(child);
  currentSuite = child;
  try {
    register();
  } finally {
    currentSuite = parent;
  }
}

function test(name: string, fn: AsyncTestFunction): void {
  currentSuite.tests.push({ name, fn });
}

function setup(fn: AsyncTestFunction): void {
  currentSuite.setupHooks.push(fn);
}

function teardown(fn: AsyncTestFunction): void {
  currentSuite.teardownHooks.push(fn);
}

function getLineage(suiteNode: SuiteNode): SuiteNode[] {
  const lineage: SuiteNode[] = [];
  let cursor: SuiteNode | undefined = suiteNode;
  while (cursor && cursor.parent) {
    lineage.unshift(cursor);
    cursor = cursor.parent;
  }
  return lineage;
}

async function runHooks(hooks: AsyncTestFunction[]): Promise<void> {
  for (const hook of hooks) {
    await hook();
  }
}

async function runTestCase(
  suiteNode: SuiteNode,
  testCase: TestCase,
  failures: string[],
): Promise<void> {
  const lineage = getLineage(suiteNode);
  const prefix = lineage.map((node) => node.name).join(" > ");
  const testName = prefix ? `${prefix} > ${testCase.name}` : testCase.name;

  try {
    await runHooks(lineage.flatMap((node) => node.setupHooks));
    await testCase.fn();
    console.log(`PASS ${testName}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    failures.push(`${testName}\n${message}`);
    console.error(`FAIL ${testName}`);
    console.error(message);
  } finally {
    const teardownHooks = lineage
      .slice()
      .reverse()
      .flatMap((node) => node.teardownHooks);
    try {
      await runHooks(teardownHooks);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      failures.push(`${testName} [teardown]\n${message}`);
      console.error(`FAIL ${testName} [teardown]`);
      console.error(message);
    }
  }
}

async function runSuite(suiteNode: SuiteNode, failures: string[]): Promise<void> {
  for (const testCase of suiteNode.tests) {
    await runTestCase(suiteNode, testCase, failures);
  }

  for (const childSuite of suiteNode.suites) {
    await runSuite(childSuite, failures);
  }
}

export function installTestGlobals(): void {
  const globalObject = globalThis as Record<string, unknown>;

  globalObject.suite = suite;
  globalObject.test = test;
  globalObject.setup = setup;
  globalObject.teardown = teardown;
  globalObject.assert = assert;
}

export async function runRegisteredTests(): Promise<void> {
  const failures: string[] = [];
  await runSuite(rootSuite, failures);

  if (failures.length > 0) {
    throw new Error(`${failures.length} test(s) failed`);
  }
}

export function resetTestRegistry(): void {
  rootSuite.suites.length = 0;
  rootSuite.tests.length = 0;
  rootSuite.setupHooks.length = 0;
  rootSuite.teardownHooks.length = 0;
  currentSuite = rootSuite;
}
