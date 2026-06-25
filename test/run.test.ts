import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/run.ts";
import { createFakeCore } from "./helpers/fake-core.ts";

type Ofetch = typeof import("ofetch").ofetch;

function fakeFetch(raw: (url: string, options: unknown) => Promise<unknown>): Ofetch {
  return { raw } as unknown as Ofetch;
}

describe("run — success", () => {
  it("sets response, headers and status outputs", async () => {
    const core = createFakeCore({ url: "https://x.test" });
    const fetch = fakeFetch(async () => ({
      status: 200,
      headers: new Headers({ "x-test": "1" }),
      _data: { ok: true },
    }));
    await run(core, fetch);
    expect(core.failed).toBeUndefined();
    expect(core.outputs.status).toBe("200");
    expect(core.outputs.response).toBe('{"ok":true}');
    expect(JSON.parse(core.outputs.headers!)).toEqual({ "x-test": "1" });
  });

  it("masks the response when maskResponse is true", async () => {
    const core = createFakeCore({ url: "https://x.test", maskResponse: "true" });
    const fetch = fakeFetch(async () => ({ status: 200, headers: new Headers(), _data: "secret" }));
    await run(core, fetch);
    expect(core.secrets).toContain("secret");
  });

  it("writes the response to responseFile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ofetch-run-"));
    const out = join(dir, "resp.json");
    const core = createFakeCore({ url: "https://x.test", responseFile: out });
    const fetch = fakeFetch(async () => ({ status: 200, headers: new Headers(), _data: { a: 1 } }));
    await run(core, fetch);
    expect(await readFile(out, "utf8")).toBe('{"a":1}');
  });
});

describe("run — HTTP error", () => {
  function httpError() {
    return Object.assign(new Error("HTTP 404"), {
      name: "FetchError",
      status: 404,
      data: { error: "missing" },
      response: {
        status: 404,
        headers: new Headers({ "x-test": "1" }),
        _data: { error: "missing" },
      },
    });
  }

  it("fails and sets requestError on a non-2xx status", async () => {
    const core = createFakeCore({ url: "https://x.test" });
    const fetch = fakeFetch(async () => {
      throw httpError();
    });
    await run(core, fetch);
    expect(core.failed).toMatch(/404/);
    expect(core.outputs.status).toBe("404");
    expect(core.outputs.response).toBe('{"error":"missing"}');
    expect(JSON.parse(core.outputs.requestError!)).toMatchObject({
      status: 404,
      name: "FetchError",
    });
  });

  it("does not fail when the status is in ignoreStatusCodes", async () => {
    const core = createFakeCore({ url: "https://x.test", ignoreStatusCodes: "404" });
    const fetch = fakeFetch(async () => {
      throw httpError();
    });
    await run(core, fetch);
    expect(core.failed).toBeUndefined();
    expect(core.outputs.status).toBe("404");
  });
});

describe("run — network error", () => {
  function networkError() {
    return Object.assign(new Error("connect ECONNREFUSED"), { name: "FetchError" });
  }

  it("fails by default", async () => {
    const core = createFakeCore({ url: "https://x.test" });
    const fetch = fakeFetch(async () => {
      throw networkError();
    });
    await run(core, fetch);
    expect(core.failed).toMatch(/ECONNREFUSED/);
    expect(JSON.parse(core.outputs.requestError!)).toMatchObject({ name: "FetchError" });
  });

  it("does not fail when preventFailureOnNoResponse is true", async () => {
    const core = createFakeCore({ url: "https://x.test", preventFailureOnNoResponse: "true" });
    const fetch = fakeFetch(async () => {
      throw networkError();
    });
    await run(core, fetch);
    expect(core.failed).toBeUndefined();
    expect(core.warnings.length).toBe(1);
  });
});
