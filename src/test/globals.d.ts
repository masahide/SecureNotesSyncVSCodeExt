declare global {
  function suite(name: string, callback: () => void): void;
  function test(name: string, callback: () => void | Promise<void>): void;
  function setup(callback: () => void | Promise<void>): void;
  function teardown(callback: () => void | Promise<void>): void;
}

export {};
