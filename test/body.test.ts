import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildBody } from "../src/body.ts";
import type { ActionInputs } from "../src/inputs.ts";

function baseInputs(overrides: Partial<ActionInputs>): ActionInputs {
  return {
    url: "https://x.test",
    method: "POST",
    headers: {},
    contentType: "application/json",
    ignoreResponseError: false,
    maskResponse: false,
    preventFailureOnNoResponse: false,
    ...overrides,
  };
}

let dir: string;
let fileA: string;
let fileB: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ofetch-action-"));
  fileA = join(dir, "a.html");
  fileB = join(dir, "b.json");
  await writeFile(fileA, "<h1>a</h1>");
  await writeFile(fileB, '{"b":true}');
});

describe("buildBody — raw string (#182)", () => {
  it("passes a JSON string through unchanged with content-type", async () => {
    const raw = '{"token":"a\\"b","x":1}';
    const result = await buildBody(baseInputs({ body: raw }));
    expect(result.body).toBe(raw);
    expect(result.headers["content-type"]).toBe("application/json");
  });

  it("honours a custom contentType", async () => {
    const result = await buildBody(
      baseInputs({ body: "k=v", contentType: "application/x-www-form-urlencoded" }),
    );
    expect(result.headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });
});

describe("buildBody — octet-stream (#226)", () => {
  it("reads the file into a Buffer and sets octet-stream", async () => {
    const result = await buildBody(baseInputs({ file: fileA }));
    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect((result.body as Buffer).toString()).toBe("<h1>a</h1>");
    expect(result.headers["content-type"]).toBe("application/octet-stream");
  });
});

describe("buildBody — multipart (#120)", () => {
  it("appends an array of files under the same field", async () => {
    const result = await buildBody(baseInputs({ files: { attachments: [fileA, fileB] } }));
    expect(result.body).toBeInstanceOf(FormData);
    const form = result.body as FormData;
    const all = form.getAll("attachments");
    expect(all).toHaveLength(2);
    expect((all[0] as File).name).toBe("a.html");
    expect((all[1] as File).name).toBe("b.json");
    // multipart: do not set content-type (fetch sets the boundary)
    expect(result.headers["content-type"]).toBeUndefined();
  });

  it("merges scalar body fields into the form", async () => {
    const result = await buildBody(baseInputs({ files: { f: fileA }, body: '{"jobId":"42"}' }));
    const form = result.body as FormData;
    expect(form.get("jobId")).toBe("42");
    expect((form.getAll("f")[0] as File).name).toBe("a.html");
  });
});

describe("buildBody — empty", () => {
  it("returns no body when nothing is provided", async () => {
    const result = await buildBody(baseInputs({}));
    expect(result.body).toBeUndefined();
    expect(result.headers).toEqual({});
  });
});
