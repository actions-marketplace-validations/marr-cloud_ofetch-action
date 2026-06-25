import type { CoreLike } from "../../src/run.ts";

export interface FakeCore extends CoreLike {
  outputs: Record<string, string>;
  secrets: string[];
  warnings: string[];
  failed?: string;
}

export function createFakeCore(inputs: Record<string, string>): FakeCore {
  const core: FakeCore = {
    outputs: {},
    secrets: [],
    warnings: [],
    failed: undefined,
    getInput(name, options) {
      const value = inputs[name] ?? "";
      if (options?.required && value === "") {
        throw new Error(`Input required and not supplied: ${name}`);
      }
      return value;
    },
    setOutput(name, value) {
      core.outputs[name] = String(value);
    },
    setFailed(message) {
      core.failed = message;
    },
    setSecret(value) {
      core.secrets.push(value);
    },
    info() {},
    debug() {},
    warning(message) {
      core.warnings.push(message);
    },
  };
  return core;
}
