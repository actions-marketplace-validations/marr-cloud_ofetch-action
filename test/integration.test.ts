import { Buffer } from "node:buffer";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ofetch } from "ofetch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/run.ts";
import { createFakeCore } from "./helpers/fake-core.ts";
import { startServer, type TestServer } from "./helpers/server.ts";

let server: TestServer;
let dir: string;
let fileA: string;
let fileB: string;

beforeAll(async () => {
  server = await startServer();
  dir = await mkdtemp(join(tmpdir(), "ofetch-it-"));
  fileA = join(dir, "a.html");
  fileB = join(dir, "b.json");
  await writeFile(fileA, "<h1>a</h1>");
  await writeFile(fileB, '{"b":true}');
});

afterAll(async () => {
  await server.close();
});

function last(): (typeof server.requests)[number] {
  return server.requests.at(-1)!;
}

describe("wire format", () => {
  it("sends method, query and custom headers", async () => {
    const core = createFakeCore({
      url: `${server.url}/echo`,
      method: "POST",
      query: '{"page":"2"}',
      headers: '{"X-Test":"abc"}',
      body: "{}",
    });
    await run(core, ofetch);
    expect(core.outputs.status).toBe("200");
    expect(last().method).toBe("POST");
    expect(last().path).toBe("/echo");
    expect(last().headers["x-test"]).toBe("abc");
  });

  it("sends a bearer token", async () => {
    const core = createFakeCore({ url: `${server.url}/echo`, bearerToken: "tok" });
    await run(core, ofetch);
    expect(last().headers["authorization"]).toBe("Bearer tok");
    expect(core.secrets).toContain("tok");
  });

  it("sends basic auth", async () => {
    const core = createFakeCore({ url: `${server.url}/echo`, username: "u", password: "p" });
    await run(core, ofetch);
    expect(last().headers["authorization"]).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
  });

  it("passes a JSON string body through verbatim (#182)", async () => {
    const raw = '{"token":"a\\"b","x":1}';
    const core = createFakeCore({ url: `${server.url}/echo`, method: "POST", body: raw });
    await run(core, ofetch);
    expect(last().body.toString("utf8")).toBe(raw);
    expect(last().headers["content-type"]).toBe("application/json");
  });

  it("uploads an array of files in one field (#120)", async () => {
    const core = createFakeCore({
      url: `${server.url}/echo`,
      method: "POST",
      files: JSON.stringify({ attachments: [fileA, fileB] }),
    });
    await run(core, ofetch);
    const text = last().body.toString("utf8");
    expect(last().headers["content-type"]).toMatch(/^multipart\/form-data/);
    expect(text).toContain('filename="a.html"');
    expect(text).toContain('filename="b.json"');
    expect(text.match(/name="attachments"/g)).toHaveLength(2);
  });

  it("uploads a single file as octet-stream with content-length (#226)", async () => {
    const core = createFakeCore({ url: `${server.url}/echo`, method: "POST", file: fileA });
    await run(core, ofetch);
    expect(last().headers["content-type"]).toBe("application/octet-stream");
    expect(last().headers["content-length"]).toBe(String(Buffer.byteLength("<h1>a</h1>")));
    expect(last().body.toString("utf8")).toBe("<h1>a</h1>");
  });
});

describe("resilience", () => {
  it("retries on a retryStatusCode then succeeds", async () => {
    server.flakyFailures = 2;
    const before = server.requests.length;
    const core = createFakeCore({
      url: `${server.url}/flaky`,
      retry: "3",
      retryDelay: "10",
      retryStatusCodes: "503",
    });
    await run(core, ofetch);
    expect(core.outputs.status).toBe("200");
    expect(server.requests.length - before).toBe(3); // 2 failures + 1 success
  });

  it("times out on a slow response", async () => {
    const core = createFakeCore({ url: `${server.url}/slow`, timeout: "50" });
    await run(core, ofetch);
    expect(core.failed).toBeDefined();
    // ofetch wraps the abort in a FetchError; assert on the serialized message.
    expect(core.outputs.requestError).toMatch(/timeout|abort/i);
  });
});

describe("response handling", () => {
  it("fails on 500 and exposes the body", async () => {
    const core = createFakeCore({ url: `${server.url}/status/500` });
    await run(core, ofetch);
    expect(core.failed).toMatch(/500/);
    expect(core.outputs.status).toBe("500");
    expect(JSON.parse(core.outputs.response!)).toEqual({ status: 500 });
  });

  it("treats a status in ignoreStatusCodes as success", async () => {
    const core = createFakeCore({ url: `${server.url}/status/404`, ignoreStatusCodes: "404" });
    await run(core, ofetch);
    expect(core.failed).toBeUndefined();
    expect(core.outputs.status).toBe("404");
  });

  it("does not fail with ignoreResponseError", async () => {
    const core = createFakeCore({ url: `${server.url}/status/503`, ignoreResponseError: "true" });
    await run(core, ofetch);
    expect(core.failed).toBeUndefined();
    expect(core.outputs.status).toBe("503");
  });

  it("returns text with responseType text", async () => {
    const core = createFakeCore({ url: `${server.url}/text`, responseType: "text" });
    await run(core, ofetch);
    expect(core.outputs.response).toBe("plain text body");
  });

  it("writes the response to responseFile", async () => {
    const out = join(dir, "out.json");
    const core = createFakeCore({ url: `${server.url}/status/200`, responseFile: out });
    await run(core, ofetch);
    expect(JSON.parse(await readFile(out, "utf8"))).toEqual({ status: 200 });
  });
});
