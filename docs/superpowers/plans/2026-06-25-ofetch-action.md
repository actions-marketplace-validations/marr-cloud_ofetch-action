# ofetch-action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Action that performs HTTP requests via [unjs/ofetch](https://github.com/unjs/ofetch), exposing most of ofetch's options plus auth, file uploads, and response handling — with a complete unit + integration test suite.

**Architecture:** Small, isolated modules: `inputs` (parse env → typed config), `body` (assemble string/multipart/octet-stream bodies), `request` (map config → ofetch options + auth headers), `run` (orchestrate the call, decide pass/fail, emit outputs), and a thin `index` entry. ofetch performs retry-then-throw; `run` decides failure in a `catch`. The build inlines all runtime deps into a self-contained `dist/`.

**Tech Stack:** TypeScript (ESM, `.ts` import extensions), ofetch, @actions/core, obuild (rolldown) bundler, vitest + coverage-v8, oxlint + oxfmt, tsgo (typecheck), pnpm.

## Global Constraints

- **Native ofetch input naming** (`body`, `query`, `headers`, `retryDelay`, …) — not http-request-action's names.
- **Runtime deps `ofetch` and `@actions/core` live in `devDependencies`** so obuild bundles them into `dist/` (obuild externalizes anything in `dependencies`/`peerDependencies`). `dependencies` stays empty.
- **`dist/` is committed** (whole folder, incl. `_chunks/`). The action's `main` is `dist/index.mjs`.
- **TS config is strict** with `verbatimModuleSyntax` + `allowImportingTsExtensions`: import sibling modules with the `.ts` extension; use `import type` for type-only imports.
- **Node 24 runtime** (`runs.using: node24`). Top-level `await` is allowed in the bundled entry.
- **Repo identity is personal** (`marr-cloud <maurrod2001@outlook.com>`, already set as the repo's local git config). Append `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` to commit messages.
- **Before every commit**, run `pnpm exec oxlint . --fix && pnpm exec oxfmt .` so `pnpm lint` stays green. (Do not rely on `pnpm fmt`, which also runs `automd` and needs network.)
- **Output names:** `response`, `headers`, `status`, `requestError`.
- **Action ref:** `marr-cloud/ofetch-action@v1`. Marketplace name: "ofetch HTTP Request".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/index.ts` | Thin entry. Wires real `@actions/core` + `ofetch`, calls `run`. Bundle entrypoint. |
| `src/inputs.ts` | `ActionInputs` type, pure parse helpers, `readInputs(core)`. |
| `src/body.ts` | `BodyResult` type, `buildBody(inputs)` — raw string / multipart / octet-stream. |
| `src/request.ts` | `BuiltRequest` type, `buildRequest(inputs)` — ofetch options + auth headers. |
| `src/run.ts` | `CoreLike` type, `run(core, fetch)` — orchestration, pass/fail, outputs. |
| `test/inputs.test.ts` | Unit tests for parse helpers + `readInputs`. |
| `test/body.test.ts` | Unit tests for `buildBody` (covers #182, #226, #120). |
| `test/request.test.ts` | Unit tests for `buildRequest`. |
| `test/run.test.ts` | Unit tests for `run` with fake core + fake fetch. |
| `test/integration.test.ts` | Real ofetch + local echo server (wire format + end-to-end run). |
| `test/helpers/server.ts` | Ephemeral `node:http` echo/control server for integration tests. |
| `test/helpers/fake-core.ts` | `FakeCore` implementing `CoreLike` for unit tests. |
| `action.yml` | Full inputs/outputs + branding. |
| `build.config.ts` | obuild bundle config (self-contained dist, no dts). |
| `.github/workflows/checks.yml` | lint + typecheck + test + build + dist-sync; self-test job on self-hosted runner. |
| `README.md`, `AGENTS.md` | Docs. |
| `package.json` | name, repository, deps layout. |

The starter's placeholder `src/index.ts` and `test/index.test.ts` are replaced; delete `test/index.test.ts` in Task 1.

---

## Task 1: Tooling & build config for a self-contained action

**Files:**
- Modify: `package.json`
- Modify: `build.config.ts`
- Delete: `test/index.test.ts`
- Modify: `src/index.ts` (temporary minimal entry, replaced in Task 7)

**Interfaces:**
- Produces: a working toolchain — `pnpm build` emits a self-contained `dist/index.mjs` with `ofetch`/`@actions/core` inlined.

- [ ] **Step 1: Move runtime deps to devDependencies and set package metadata**

Replace `package.json` with:

```json
{
  "name": "ofetch-action",
  "version": "0.0.0",
  "description": "GitHub Action for HTTP requests powered by unjs/ofetch",
  "license": "MIT",
  "repository": "marr-cloud/ofetch-action",
  "files": [
    "dist"
  ],
  "type": "module",
  "sideEffects": false,
  "scripts": {
    "build": "obuild",
    "dev": "vitest dev",
    "fmt": "automd && oxlint . --fix && oxfmt .",
    "lint": "oxlint . && oxfmt --check .",
    "test": "pnpm lint && pnpm typecheck && vitest run --coverage",
    "typecheck": "tsgo --noEmit --skipLibCheck"
  },
  "devDependencies": {
    "@actions/core": "^3.0.1",
    "@types/node": "latest",
    "@typescript/native-preview": "latest",
    "@vitest/coverage-v8": "latest",
    "automd": "latest",
    "changelogen": "latest",
    "obuild": "latest",
    "ofetch": "^1.5.1",
    "oxfmt": "latest",
    "oxlint": "latest",
    "typescript": "latest",
    "vitest": "latest"
  },
  "packageManager": "pnpm@10.33.2",
  "dependencies": {}
}
```

(Removed `types`/`exports` — this is an action, not a published library. Removed `prepack`/`release` library scripts.)

- [ ] **Step 2: Configure obuild to skip dts and keep the bundle entry**

Replace `build.config.ts` with:

```ts
import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts"],
      dts: false,
    },
  ],
});
```

- [ ] **Step 3: Add a temporary minimal entry**

Replace `src/index.ts` with:

```ts
import { ofetch } from "ofetch";

// Temporary smoke entry — replaced in Task 6.
export const fetchImpl = ofetch;
```

- [ ] **Step 4: Remove the starter's placeholder test**

```bash
rm test/index.test.ts
```

- [ ] **Step 5: Reinstall so the dependency move is reflected**

Run: `pnpm install`
Expected: completes; `node_modules/.bin/obuild` exists.

- [ ] **Step 6: Build and verify the bundle is self-contained**

Run: `pnpm build`
Expected: `dist/index.mjs` is created.

Then verify ofetch is inlined (NOT left as a bare import):

Run: `node -e "const s=require('fs').readFileSync('dist/index.mjs','utf8'); if(/from\s*[\"']ofetch[\"']/.test(s)){console.error('FAIL: ofetch externalized');process.exit(1)} console.log('OK: ofetch inlined')"`
Expected: `OK: ofetch inlined`

- [ ] **Step 7: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "chore: configure self-contained action build (bundle runtime deps)"
```

---

## Task 2: Input parse helpers (`src/inputs.ts`)

**Files:**
- Create: `src/inputs.ts`
- Test: `test/inputs.test.ts`

**Interfaces:**
- Produces:
  - `parseBoolean(value: string): boolean`
  - `parseNumber(value: string, name: string): number | undefined`
  - `parseNumberList(value: string): number[] | undefined`
  - `parseJsonObject(value: string, name: string): Record<string, unknown> | undefined`
  - `parseFiles(value: string): Record<string, string | string[]> | undefined`

- [ ] **Step 1: Write the failing tests**

Create `test/inputs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseBoolean,
  parseFiles,
  parseJsonObject,
  parseNumber,
  parseNumberList,
} from "../src/inputs.ts";

describe("parseBoolean", () => {
  it("treats empty as false", () => {
    expect(parseBoolean("")).toBe(false);
  });
  it("parses true/false case-insensitively", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("FALSE")).toBe(false);
  });
  it("throws on invalid value", () => {
    expect(() => parseBoolean("yes")).toThrow();
  });
});

describe("parseNumber", () => {
  it("returns undefined for empty", () => {
    expect(parseNumber("", "timeout")).toBeUndefined();
  });
  it("parses an integer", () => {
    expect(parseNumber("5000", "timeout")).toBe(5000);
  });
  it("throws on NaN", () => {
    expect(() => parseNumber("abc", "timeout")).toThrow();
  });
});

describe("parseNumberList", () => {
  it("returns undefined for empty", () => {
    expect(parseNumberList("")).toBeUndefined();
  });
  it("parses a comma list with spaces", () => {
    expect(parseNumberList("429, 500 ,503")).toEqual([429, 500, 503]);
  });
  it("throws on a non-number entry", () => {
    expect(() => parseNumberList("200,oops")).toThrow();
  });
});

describe("parseJsonObject", () => {
  it("returns undefined for empty", () => {
    expect(parseJsonObject("", "query")).toBeUndefined();
  });
  it("parses an object", () => {
    expect(parseJsonObject('{"a":"1"}', "query")).toEqual({ a: "1" });
  });
  it("throws on invalid JSON", () => {
    expect(() => parseJsonObject("{nope}", "query")).toThrow();
  });
  it("throws on a JSON array", () => {
    expect(() => parseJsonObject("[1,2]", "query")).toThrow();
  });
});

describe("parseFiles", () => {
  it("accepts string and array values", () => {
    expect(parseFiles('{"a":"x.txt","b":["y.txt","z.txt"]}')).toEqual({
      a: "x.txt",
      b: ["y.txt", "z.txt"],
    });
  });
  it("throws on a non-string array element", () => {
    expect(() => parseFiles('{"a":[1]}')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/inputs.test.ts`
Expected: FAIL (cannot resolve `../src/inputs.ts` / exports undefined).

- [ ] **Step 3: Implement the helpers**

Create `src/inputs.ts`:

```ts
export function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "false") return false;
  if (v === "true") return true;
  throw new Error(`Invalid boolean value: "${value}" (expected "true" or "false")`);
}

export function parseNumber(value: string, name: string): number | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Invalid number for "${name}": "${value}"`);
  return n;
}

export function parseNumberList(value: string): number[] | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  return v.split(",").map((part) => {
    const n = Number(part.trim());
    if (Number.isNaN(n)) throw new Error(`Invalid number in list: "${part}"`);
    return n;
  });
}

export function parseJsonObject(value: string, name: string): Record<string, unknown> | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch (error) {
    throw new Error(`Invalid JSON for "${name}": ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object for "${name}"`);
  }
  return parsed as Record<string, unknown>;
}

export function parseFiles(value: string): Record<string, string | string[]> | undefined {
  const obj = parseJsonObject(value, "files");
  if (!obj) return undefined;
  const result: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      result[key] = val;
    } else if (Array.isArray(val) && val.every((p) => typeof p === "string")) {
      result[key] = val as string[];
    } else {
      throw new Error(`Invalid "files" entry "${key}": expected a path string or array of path strings`);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/inputs.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: add input parse helpers"
```

---

## Task 2b: `ActionInputs` + `readInputs` (`src/inputs.ts`)

**Files:**
- Modify: `src/inputs.ts`
- Test: `test/inputs.test.ts`

**Interfaces:**
- Produces:
  - `interface ActionInputs` (fields below)
  - `interface InputReader { getInput(name: string, options?: { required?: boolean }): string }`
  - `readInputs(core: InputReader): ActionInputs`
- Consumes: the parse helpers from Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `test/inputs.test.ts`:

```ts
import { type InputReader, readInputs } from "../src/inputs.ts";

function reader(values: Record<string, string>): InputReader {
  return {
    getInput(name, options) {
      const value = values[name] ?? "";
      if (options?.required && value === "") {
        throw new Error(`Input required and not supplied: ${name}`);
      }
      return value;
    },
  };
}

describe("readInputs", () => {
  it("applies defaults", () => {
    const inputs = readInputs(reader({ url: "https://x.test" }));
    expect(inputs.url).toBe("https://x.test");
    expect(inputs.method).toBe("GET");
    expect(inputs.contentType).toBe("application/json");
    expect(inputs.headers).toEqual({});
    expect(inputs.ignoreResponseError).toBe(false);
    expect(inputs.maskResponse).toBe(false);
    expect(inputs.preventFailureOnNoResponse).toBe(false);
  });

  it("throws when url is missing", () => {
    expect(() => readInputs(reader({}))).toThrow(/url/);
  });

  it("parses the full set", () => {
    const inputs = readInputs(
      reader({
        url: "https://x.test",
        method: "post",
        baseURL: "https://api.test",
        body: '{"a":1}',
        query: '{"page":"2"}',
        headers: '{"X-Test":"1"}',
        contentType: "text/plain",
        timeout: "5000",
        retry: "3",
        retryDelay: "1000",
        retryStatusCodes: "500,503",
        responseType: "text",
        ignoreResponseError: "true",
        bearerToken: "tok",
        ignoreStatusCodes: "404",
        maskResponse: "true",
      }),
    );
    expect(inputs.method).toBe("post");
    expect(inputs.baseURL).toBe("https://api.test");
    expect(inputs.query).toEqual({ page: "2" });
    expect(inputs.headers).toEqual({ "X-Test": "1" });
    expect(inputs.contentType).toBe("text/plain");
    expect(inputs.timeout).toBe(5000);
    expect(inputs.retry).toBe(3);
    expect(inputs.retryDelay).toBe(1000);
    expect(inputs.retryStatusCodes).toEqual([500, 503]);
    expect(inputs.responseType).toBe("text");
    expect(inputs.ignoreResponseError).toBe(true);
    expect(inputs.bearerToken).toBe("tok");
    expect(inputs.ignoreStatusCodes).toEqual([404]);
    expect(inputs.maskResponse).toBe(true);
  });

  it("rejects an invalid responseType", () => {
    expect(() => readInputs(reader({ url: "https://x.test", responseType: "xml" }))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/inputs.test.ts`
Expected: FAIL (`readInputs` / `InputReader` not exported).

- [ ] **Step 3: Implement `ActionInputs`, `InputReader`, `readInputs`**

Append to `src/inputs.ts`:

```ts
export interface ActionInputs {
  url: string;
  method: string;
  baseURL?: string;
  body?: string;
  query?: Record<string, unknown>;
  headers: Record<string, string>;
  contentType?: string;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
  retryStatusCodes?: number[];
  responseType?: "json" | "text";
  ignoreResponseError: boolean;
  bearerToken?: string;
  username?: string;
  password?: string;
  files?: Record<string, string | string[]>;
  file?: string;
  responseFile?: string;
  maskResponse: boolean;
  ignoreStatusCodes?: number[];
  preventFailureOnNoResponse: boolean;
}

export interface InputReader {
  getInput(name: string, options?: { required?: boolean }): string;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseResponseType(value: string): "json" | "text" | undefined {
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "json" || v === "text") return v;
  throw new Error(`Invalid responseType: "${value}" (expected "json" or "text")`);
}

export function readInputs(core: InputReader): ActionInputs {
  const get = (name: string) => core.getInput(name);
  return {
    url: core.getInput("url", { required: true }),
    method: optional(get("method")) ?? "GET",
    baseURL: optional(get("baseURL")),
    body: optional(get("body")),
    query: parseJsonObject(get("query"), "query"),
    headers: (parseJsonObject(get("headers"), "headers") as Record<string, string>) ?? {},
    contentType: optional(get("contentType")) ?? "application/json",
    timeout: parseNumber(get("timeout"), "timeout"),
    retry: parseNumber(get("retry"), "retry"),
    retryDelay: parseNumber(get("retryDelay"), "retryDelay"),
    retryStatusCodes: parseNumberList(get("retryStatusCodes")),
    responseType: parseResponseType(get("responseType")),
    ignoreResponseError: parseBoolean(get("ignoreResponseError")),
    bearerToken: optional(get("bearerToken")),
    username: optional(get("username")),
    password: optional(get("password")),
    files: parseFiles(get("files")),
    file: optional(get("file")),
    responseFile: optional(get("responseFile")),
    maskResponse: parseBoolean(get("maskResponse")),
    ignoreStatusCodes: parseNumberList(get("ignoreStatusCodes")),
    preventFailureOnNoResponse: parseBoolean(get("preventFailureOnNoResponse")),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/inputs.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: parse action inputs into typed config"
```

---

## Task 3: Body assembly (`src/body.ts`)

**Files:**
- Create: `src/body.ts`
- Test: `test/body.test.ts`

**Interfaces:**
- Consumes: `ActionInputs` from `src/inputs.ts`.
- Produces:
  - `interface BodyResult { body?: string | Buffer | FormData; headers: Record<string, string> }`
  - `buildBody(inputs: ActionInputs): Promise<BodyResult>`

Precedence: `file` > `files` > `body`.

- [ ] **Step 1: Write the failing tests**

Create `test/body.test.ts`:

```ts
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
    const result = await buildBody(baseInputs({ body: "k=v", contentType: "application/x-www-form-urlencoded" }));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/body.test.ts`
Expected: FAIL (cannot resolve `../src/body.ts`).

- [ ] **Step 3: Implement `buildBody`**

Create `src/body.ts`:

```ts
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ActionInputs } from "./inputs.ts";

export interface BodyResult {
  body?: string | Buffer | FormData;
  headers: Record<string, string>;
}

async function fileToBlob(path: string): Promise<Blob> {
  const buffer = await readFile(path);
  return new Blob([buffer]);
}

export async function buildBody(inputs: ActionInputs): Promise<BodyResult> {
  if (inputs.file) {
    const buffer = await readFile(inputs.file);
    return { body: buffer, headers: { "content-type": "application/octet-stream" } };
  }

  if (inputs.files) {
    const form = new FormData();
    if (inputs.body) {
      const fields = JSON.parse(inputs.body) as Record<string, unknown>;
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, String(value));
      }
    }
    for (const [field, value] of Object.entries(inputs.files)) {
      const paths = Array.isArray(value) ? value : [value];
      for (const path of paths) {
        form.append(field, await fileToBlob(path), basename(path));
      }
    }
    return { body: form, headers: {} };
  }

  if (inputs.body !== undefined) {
    const headers: Record<string, string> = {};
    if (inputs.contentType) headers["content-type"] = inputs.contentType;
    return { body: inputs.body, headers };
  }

  return { headers: {} };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/body.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: assemble request bodies (raw, multipart, octet-stream)"
```

---

## Task 4: Request assembly (`src/request.ts`)

**Files:**
- Create: `src/request.ts`
- Test: `test/request.test.ts`

**Interfaces:**
- Consumes: `ActionInputs` (Task 2b), `buildBody` (Task 3).
- Produces:
  - `interface BuiltRequest { url: string; options: import("ofetch").FetchOptions }`
  - `buildRequest(inputs: ActionInputs): Promise<BuiltRequest>`

- [ ] **Step 1: Write the failing tests**

Create `test/request.test.ts`:

```ts
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ActionInputs } from "../src/inputs.ts";
import { buildRequest } from "../src/request.ts";

function baseInputs(overrides: Partial<ActionInputs>): ActionInputs {
  return {
    url: "https://x.test",
    method: "GET",
    headers: {},
    contentType: "application/json",
    ignoreResponseError: false,
    maskResponse: false,
    preventFailureOnNoResponse: false,
    ...overrides,
  };
}

describe("buildRequest", () => {
  it("maps core options", async () => {
    const { url, options } = await buildRequest(
      baseInputs({
        method: "POST",
        baseURL: "https://api.test",
        query: { page: "1" },
        timeout: 5000,
        retry: 3,
        retryDelay: 1000,
        retryStatusCodes: [500, 503],
        responseType: "text",
      }),
    );
    expect(url).toBe("https://x.test");
    expect(options.method).toBe("POST");
    expect(options.baseURL).toBe("https://api.test");
    expect(options.query).toEqual({ page: "1" });
    expect(options.timeout).toBe(5000);
    expect(options.retry).toBe(3);
    expect(options.retryDelay).toBe(1000);
    expect(options.retryStatusCodes).toEqual([500, 503]);
    expect(options.responseType).toBe("text");
  });

  it("adds a bearer Authorization header", async () => {
    const { options } = await buildRequest(baseInputs({ bearerToken: "tok" }));
    expect((options.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
  });

  it("adds a basic Authorization header", async () => {
    const { options } = await buildRequest(baseInputs({ username: "u", password: "p" }));
    const expected = `Basic ${Buffer.from("u:p").toString("base64")}`;
    expect((options.headers as Record<string, string>)["authorization"]).toBe(expected);
  });

  it("prefers bearer over basic", async () => {
    const { options } = await buildRequest(baseInputs({ bearerToken: "tok", username: "u", password: "p" }));
    expect((options.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
  });

  it("merges custom headers and body content-type", async () => {
    const { options } = await buildRequest(
      baseInputs({ method: "POST", headers: { "X-A": "1" }, body: "{}" }),
    );
    const headers = options.headers as Record<string, string>;
    expect(headers["X-A"]).toBe("1");
    expect(headers["content-type"]).toBe("application/json");
    expect(options.body).toBe("{}");
  });

  it("does not set a body or content-type for a bodyless request", async () => {
    const { options } = await buildRequest(baseInputs({ method: "GET" }));
    expect(options.body).toBeUndefined();
    expect((options.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/request.test.ts`
Expected: FAIL (cannot resolve `../src/request.ts`).

- [ ] **Step 3: Implement `buildRequest`**

Create `src/request.ts`:

```ts
import { Buffer } from "node:buffer";
import type { FetchOptions } from "ofetch";
import { buildBody } from "./body.ts";
import type { ActionInputs } from "./inputs.ts";

export interface BuiltRequest {
  url: string;
  options: FetchOptions;
}

export async function buildRequest(inputs: ActionInputs): Promise<BuiltRequest> {
  const { body, headers: bodyHeaders } = await buildBody(inputs);

  const headers: Record<string, string> = { ...inputs.headers, ...bodyHeaders };

  if (inputs.bearerToken) {
    headers["authorization"] = `Bearer ${inputs.bearerToken}`;
  } else if (inputs.username !== undefined && inputs.password !== undefined) {
    const token = Buffer.from(`${inputs.username}:${inputs.password}`).toString("base64");
    headers["authorization"] = `Basic ${token}`;
  }

  const options: FetchOptions = { method: inputs.method, headers };
  if (body !== undefined) options.body = body as FetchOptions["body"];
  if (inputs.baseURL) options.baseURL = inputs.baseURL;
  if (inputs.query) options.query = inputs.query;
  if (inputs.timeout !== undefined) options.timeout = inputs.timeout;
  if (inputs.retry !== undefined) options.retry = inputs.retry;
  if (inputs.retryDelay !== undefined) options.retryDelay = inputs.retryDelay;
  if (inputs.retryStatusCodes) options.retryStatusCodes = inputs.retryStatusCodes;
  if (inputs.responseType) options.responseType = inputs.responseType;

  return { url: inputs.url, options };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/request.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: build ofetch request options with auth headers"
```

---

## Task 5: Orchestration (`src/run.ts`)

**Files:**
- Create: `src/run.ts`
- Create: `test/helpers/fake-core.ts`
- Test: `test/run.test.ts`

**Interfaces:**
- Consumes: `readInputs` (Task 2b), `buildRequest` (Task 4).
- Produces:
  - `interface CoreLike` (superset of `InputReader` with `setOutput`, `setFailed`, `setSecret`, `info`, `debug`, `warning`)
  - `run(core: CoreLike, fetch: typeof import("ofetch").ofetch): Promise<void>`
  - `createFakeCore(inputs: Record<string, string>): FakeCore`

- [ ] **Step 1: Write the fake core helper**

Create `test/helpers/fake-core.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

Create `test/run.test.ts`:

```ts
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
    expect(JSON.parse(core.outputs.headers)).toEqual({ "x-test": "1" });
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
      response: { status: 404, headers: new Headers({ "x-test": "1" }), _data: { error: "missing" } },
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
    expect(JSON.parse(core.outputs.requestError)).toMatchObject({ status: 404, name: "FetchError" });
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
    expect(JSON.parse(core.outputs.requestError)).toMatchObject({ name: "FetchError" });
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run test/run.test.ts`
Expected: FAIL (cannot resolve `../src/run.ts`).

- [ ] **Step 4: Implement `run`**

Create `src/run.ts`:

```ts
import { writeFile } from "node:fs/promises";
import type { IFetchError } from "ofetch";
import { type ActionInputs, type InputReader, readInputs } from "./inputs.ts";
import { buildRequest } from "./request.ts";

export interface CoreLike extends InputReader {
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  setSecret(value: string): void;
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
}

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function serializeBody(data: unknown): string {
  if (data === undefined || data === null) return "";
  return typeof data === "string" ? data : JSON.stringify(data);
}

function serializeError(error: IFetchError, status?: number): string {
  return JSON.stringify({
    name: error.name,
    message: error.message,
    status: status ?? error.status,
    data: error.data,
  });
}

async function emitResponse(
  core: CoreLike,
  inputs: ActionInputs,
  status: number,
  headers: Record<string, string>,
  data: unknown,
): Promise<void> {
  const responseString = serializeBody(data);
  if (inputs.maskResponse && responseString) core.setSecret(responseString);
  core.setOutput("response", responseString);
  core.setOutput("headers", JSON.stringify(headers));
  core.setOutput("status", String(status));
  if (inputs.responseFile) await writeFile(inputs.responseFile, responseString);
}

export async function run(core: CoreLike, fetch: typeof import("ofetch").ofetch): Promise<void> {
  try {
    const inputs = readInputs(core);
    if (inputs.bearerToken) core.setSecret(inputs.bearerToken);
    if (inputs.password) core.setSecret(inputs.password);

    const { url, options } = await buildRequest(inputs);
    if (inputs.ignoreResponseError) options.ignoreResponseError = true;

    try {
      const response = await fetch.raw(url, options);
      await emitResponse(core, inputs, response.status, headersToObject(response.headers), response._data);
    } catch (error) {
      const fetchError = error as IFetchError;
      if (fetchError.response) {
        const status = fetchError.status ?? fetchError.response.status;
        const headers = headersToObject(fetchError.response.headers);
        const data = fetchError.data ?? fetchError.response._data;
        await emitResponse(core, inputs, status, headers, data);
        if (inputs.ignoreStatusCodes?.includes(status)) {
          core.info(`Ignoring status code ${status}`);
          return;
        }
        core.setOutput("requestError", serializeError(fetchError, status));
        core.setFailed(`Request to ${url} failed with status ${status}`);
        return;
      }
      core.setOutput("requestError", serializeError(fetchError));
      if (inputs.preventFailureOnNoResponse) {
        core.warning(`No response received: ${fetchError.message}`);
        return;
      }
      core.setFailed(fetchError.message);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run test/run.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: orchestrate request, failure handling, and outputs"
```

---

## Task 6: Entry, action metadata, and committed dist

**Files:**
- Modify: `src/index.ts`
- Modify: `action.yml`

**Interfaces:**
- Consumes: `run` (Task 5).

- [ ] **Step 1: Implement the real entry**

Replace `src/index.ts` with:

```ts
import * as core from "@actions/core";
import { ofetch } from "ofetch";
import { run } from "./run.ts";

await run(core, ofetch);
```

- [ ] **Step 2: Write the full action metadata**

Replace `action.yml` with:

```yaml
name: ofetch HTTP Request
description: Make HTTP requests from your workflow using unjs/ofetch, a modern fetch wrapper.
author: marr-cloud

branding:
  icon: send
  color: blue

inputs:
  url:
    description: Request URL (absolute, or relative when baseURL is set).
    required: true
  method:
    description: HTTP method.
    default: GET
  baseURL:
    description: Base URL prepended to url.
    required: false
  body:
    description: Request body. Sent as-is; a JSON string is not re-encoded.
    required: false
  query:
    description: Query parameters as a JSON object string, e.g. '{"page":"1"}'.
    required: false
  headers:
    description: Extra request headers as a JSON object string.
    required: false
  contentType:
    description: Content-Type for the request body.
    default: application/json
  timeout:
    description: Request timeout in milliseconds.
    required: false
  retry:
    description: Number of retry attempts on failure.
    required: false
  retryDelay:
    description: Delay between retries in milliseconds.
    required: false
  retryStatusCodes:
    description: Comma-separated status codes that trigger a retry, e.g. "429,500,503".
    required: false
  responseType:
    description: Force response parsing as "json" or "text". Auto-detected when unset.
    required: false
  ignoreResponseError:
    description: Do not fail on non-2xx responses (also skips status-based retry).
    default: "false"
  bearerToken:
    description: Bearer token without the "Bearer " prefix. Sent as the Authorization header.
    required: false
  username:
    description: Username for Basic authentication.
    required: false
  password:
    description: Password for Basic authentication.
    required: false
  files:
    description: 'JSON map of field name to a file path or array of paths, sent as multipart/form-data, e.g. ''{"report":["a.html","b.json"]}''.'
    required: false
  file:
    description: Path to a single file sent as application/octet-stream.
    required: false
  responseFile:
    description: Persist the response body to this file path.
    required: false
  maskResponse:
    description: Mask the response value in logs.
    default: "false"
  ignoreStatusCodes:
    description: Comma-separated status codes treated as success (no failure).
    required: false
  preventFailureOnNoResponse:
    description: Do not fail when no response is received (network error).
    default: "false"

outputs:
  response:
    description: Response body (JSON serialized to a string, or raw text).
  headers:
    description: Response headers as a JSON object string.
  status:
    description: HTTP status code.
  requestError:
    description: On failure, a JSON string with name, message, status, and data.

runs:
  using: node24
  main: dist/index.mjs
```

- [ ] **Step 3: Build the self-contained dist**

Run: `pnpm build`
Expected: `dist/index.mjs` regenerated.

- [ ] **Step 4: Verify the entry runs and reads inputs**

Run:
```bash
INPUT_URL="https://example.com" node -e "import('./dist/index.mjs').catch(e=>{console.error(e);process.exit(1)})"
```
Expected: the process runs and exits 0 (a real GET to example.com returns 200). If the sandbox has no network, instead expect a non-crash failure message mentioning the request — that still proves the entry wires inputs → run. Network-dependent assertions live in Task 7.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit (including dist)**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "feat: wire action entry, metadata, and build dist"
```

---

## Task 7: Integration tests (real ofetch + echo server)

**Files:**
- Create: `test/helpers/server.ts`
- Create: `test/integration.test.ts`

**Interfaces:**
- Consumes: `run` (Task 5), `buildRequest` (Task 4), real `ofetch`.
- Produces: `startServer(): Promise<TestServer>` with `{ url, requests, flakyFailures, close }`.

- [ ] **Step 1: Write the echo/control server**

Create `test/helpers/server.ts`:

```ts
import { Buffer } from "node:buffer";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface ReceivedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface TestServer {
  url: string;
  requests: ReceivedRequest[];
  /** Number of times /flaky responds 503 before succeeding. */
  flakyFailures: number;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const requests: ReceivedRequest[] = [];
  const state = { flakyFailures: 0 };

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", "http://localhost");
      requests.push({ method: req.method ?? "GET", path: url.pathname, headers: req.headers, body });

      if (url.pathname === "/flaky") {
        if (state.flakyFailures > 0) {
          state.flakyFailures -= 1;
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "try again" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/slow") {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }, 300);
        return;
      }

      if (url.pathname === "/text") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("plain text body");
        return;
      }

      const statusMatch = url.pathname.match(/^\/status\/(\d+)$/);
      if (statusMatch) {
        const code = Number(statusMatch[1]);
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: code }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, received: body.toString("utf8") }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    get flakyFailures() {
      return state.flakyFailures;
    },
    set flakyFailures(n: number) {
      state.flakyFailures = n;
    },
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
```

- [ ] **Step 2: Write the integration tests**

Create `test/integration.test.ts`:

```ts
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
    expect(JSON.parse(core.outputs.response)).toEqual({ status: 500 });
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
```

- [ ] **Step 3: Run the integration tests**

Run: `pnpm exec vitest run test/integration.test.ts`
Expected: PASS (all). If the environment blocks loopback sockets, note it and run in CI instead.

- [ ] **Step 4: Run the full suite with coverage**

Run: `pnpm exec vitest run --coverage`
Expected: all test files PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "test: add integration suite with local echo server"
```

---

## Task 8: CI workflow, README, and AGENTS.md

**Files:**
- Modify: `.github/workflows/checks.yml`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:** none (docs + CI).

- [ ] **Step 1: Update the checks workflow (add build + dist-sync + self-test)**

Replace `.github/workflows/checks.yml` with:

```yaml
name: checks
on: { push: {}, pull_request: {} }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm i -fg corepack && corepack enable
      - uses: actions/setup-node@v6
        with: { node-version: lts/*, cache: "pnpm" }
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm vitest run --coverage
      - run: pnpm run lint
      - run: pnpm build
      - name: Verify dist is up to date
        run: |
          if ! git diff --exit-code -- dist; then
            echo "::error::dist is out of date. Run 'pnpm build' and commit the result."
            exit 1
          fi

  self-test:
    needs: checks
    if: ${{ github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository }}
    runs-on: [self-hosted]
    steps:
      - uses: actions/checkout@v6
      - name: Start echo server
        run: |
          node -e 'require("http").createServer((q,s)=>{let b=[];q.on("data",c=>b.push(c));q.on("end",()=>{s.writeHead(200,{"content-type":"application/json"});s.end(JSON.stringify({ok:true,method:q.method}))})}).listen(8080,"127.0.0.1",()=>console.log("up"))' &
          for i in $(seq 1 20); do curl -sf http://127.0.0.1:8080/ >/dev/null && break || sleep 0.25; done
      - name: Use the action
        id: req
        uses: ./
        with:
          url: http://127.0.0.1:8080/
          method: POST
          body: '{"hello":"world"}'
      - name: Assert outputs
        run: |
          echo "status=${{ steps.req.outputs.status }}"
          test "${{ steps.req.outputs.status }}" = "200"
          echo '${{ steps.req.outputs.response }}' | grep -q '"ok":true'
```

- [ ] **Step 2: Rewrite the README**

Replace `README.md` with:

````markdown
# ofetch-action

<!-- automd:badges color=blue -->
<!-- /automd -->

A GitHub Action for making HTTP requests, powered by [unjs/ofetch](https://github.com/unjs/ofetch) — a modern, lightweight `fetch` wrapper. A native-fetch alternative to axios-based `http-request-action`.

## Usage

```yaml
- uses: marr-cloud/ofetch-action@v1
  id: request
  with:
    url: https://api.example.com/users
    method: POST
    headers: '{"X-Token":"${{ secrets.TOKEN }}"}'
    body: '{"name":"ada"}'

- run: echo "Status ${{ steps.request.outputs.status }} — ${{ steps.request.outputs.response }}"
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `url` (required) | — | Request URL (absolute, or relative to `baseURL`). |
| `method` | `GET` | HTTP method. |
| `baseURL` | — | Base URL prepended to `url`. |
| `body` | — | Request body. Sent as-is — a JSON string is **not** re-encoded. |
| `query` | — | Query params as a JSON object string, e.g. `'{"page":"1"}'`. |
| `headers` | — | Extra headers as a JSON object string. |
| `contentType` | `application/json` | `Content-Type` for the body. |
| `timeout` | — | Timeout in milliseconds. |
| `retry` | — | Retry attempts on failure. |
| `retryDelay` | — | Delay between retries (ms). |
| `retryStatusCodes` | — | Comma-separated codes that trigger a retry, e.g. `429,500,503`. |
| `responseType` | auto | Force `json` or `text`. |
| `ignoreResponseError` | `false` | Don't fail on non-2xx (also skips status-based retry). |
| `bearerToken` | — | Bearer token (no `Bearer ` prefix). |
| `username` / `password` | — | Basic authentication. |
| `files` | — | JSON map of field → path or array of paths (multipart/form-data). |
| `file` | — | Single file path (application/octet-stream). |
| `responseFile` | — | Persist the response body to this path. |
| `maskResponse` | `false` | Mask the response value in logs. |
| `ignoreStatusCodes` | — | Comma-separated codes treated as success. |
| `preventFailureOnNoResponse` | `false` | Don't fail on a network error. |

## Outputs

| Output | Description |
|---|---|
| `response` | Response body (JSON string or raw text). |
| `headers` | Response headers as a JSON object string. |
| `status` | HTTP status code. |
| `requestError` | On failure: JSON `{ name, message, status, data }`. |

## Examples

### Multipart file upload (array of files in one field)

```yaml
- uses: marr-cloud/ofetch-action@v1
  with:
    url: https://api.example.com/upload
    method: POST
    files: '{"attachments":["report.html","report.json"]}'
```

### Single file as octet-stream

```yaml
- uses: marr-cloud/ofetch-action@v1
  with:
    url: https://api.example.com/raw
    method: PUT
    file: ./build/artifact.bin
```

### Retry on transient failures

```yaml
- uses: marr-cloud/ofetch-action@v1
  with:
    url: https://api.example.com/health
    retry: "5"
    retryDelay: "2000"
    retryStatusCodes: "429,503"
```

## Proxy

This action honours the standard proxy environment variables (via undici).
Set them on the step `env`:

```yaml
- uses: marr-cloud/ofetch-action@v1
  env:
    HTTP_PROXY: http://proxy.internal:8080
    HTTPS_PROXY: http://proxy.internal:8080
    NO_PROXY: localhost,127.0.0.1
  with:
    url: https://api.example.com/data
```

## Migrating from `fjogeleit/http-request-action`

| http-request-action | ofetch-action |
|---|---|
| `data` | `body` |
| `customHeaders` | `headers` |
| `retryWait` | `retryDelay` |
| `bearerToken` | `bearerToken` (same) |
| `username` / `password` | `username` / `password` (same) |
| `files` / `file` | `files` / `file` (same; arrays now supported) |
| `ignoreStatusCodes` | `ignoreStatusCodes` (same) |
| `responseFile` | `responseFile` (same) |
| `maskResponse` | `maskResponse` (same) |
| `preventFailureOnNoResponse` | `preventFailureOnNoResponse` (same) |
| output `requestError` | output `requestError` (same) |

> mTLS / client-certificate inputs (`httpsCA`, `httpsCert`, `httpsKey`, `ignoreSsl`) are not supported.

## Development

- Install [Node.js](https://nodejs.org/) and enable Corepack: `corepack enable`
- `pnpm install`
- `pnpm dev` — watch tests
- `pnpm test` — lint + typecheck + tests with coverage
- `pnpm build` — bundle to `dist/` (committed; the action runs `dist/index.mjs`)

## License

Published under the [MIT](./LICENSE) license.
````

- [ ] **Step 3: Update AGENTS.md with project status**

Replace `AGENTS.md` with:

```markdown
# AGENTS.md

GitHub Action for HTTP requests powered by unjs/ofetch.

## Status

- Implemented: input parsing, body assembly (raw/multipart/octet-stream), request
  building (auth, query, retry, timeout), run orchestration (pass/fail, outputs),
  action entry + metadata, full unit + integration tests, CI (checks + self-test).
- Inputs use native ofetch naming. Outputs: `response`, `headers`, `status`, `requestError`.
- Resolves http-request-action issues #182 (JSON passthrough), #226 (octet-stream
  headers), #120 (array of files per field).

## Conventions

- Runtime deps (`ofetch`, `@actions/core`) live in `devDependencies` so obuild
  inlines them; `dist/` is committed and the action runs `dist/index.mjs`.
- Keep this file updated with project status.
- Tooling: obuild (rolldown), vitest, oxlint, oxfmt, tsgo. No CLI.
```

- [ ] **Step 4: Verify the full pipeline locally**

Run: `pnpm build && pnpm typecheck && pnpm exec vitest run --coverage && pnpm run lint`
Expected: build succeeds; no type errors; all tests PASS; lint clean.

- [ ] **Step 5: Confirm dist is in sync (mirrors the CI gate)**

Run: `git diff --exit-code -- dist && echo "dist in sync"`
Expected: `dist in sync` (no diff). If there is a diff, `git add dist`.

- [ ] **Step 6: Commit**

```bash
pnpm exec oxlint . --fix && pnpm exec oxfmt .
git add -A
git commit -m "ci: add dist-sync + self-test; docs: README and AGENTS status"
```

---

## Final Verification

- [ ] `pnpm test` passes end-to-end (lint + typecheck + coverage).
- [ ] `pnpm build` produces a `dist/` with `ofetch`/`@actions/core` inlined, and `git status` shows `dist` committed and clean.
- [ ] `action.yml` lists every input/output and `runs.using: node24`, `main: dist/index.mjs`.
- [ ] Issue coverage: #182 (test/integration `passes a JSON string body through verbatim`), #226 (`octet-stream with content-length`), #120 (`array of files in one field`).
- [ ] All commits authored by `marr-cloud <maurrod2001@outlook.com>` (`git log --format='%an <%ae>'`).
