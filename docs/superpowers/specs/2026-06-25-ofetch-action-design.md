# Design: `marr-cloud/ofetch-action`

A modern GitHub Action for making HTTP requests, built on [unjs/ofetch](https://github.com/unjs/ofetch)
instead of axios. It is a spiritual successor to
[`fjogeleit/http-request-action`](https://github.com/fjogeleit/http-request-action),
exposing most of ofetch's options with a native, idiomatic naming and modern tooling
(obuild/rolldown, vitest, oxlint, oxfmt). No CLI.

## Goals

- Expose most of ofetch's capabilities through GitHub Action inputs.
- Native ofetch naming for inputs (not a drop-in clone of http-request-action).
- Cover the practical extras that make the reference action useful: auth, file
  uploads (multipart + octet-stream), response-to-file, masking, status-code
  handling.
- Fix the three open issues of http-request-action by design (#182, #226, #120).
- Complete unit + integration test suite.
- Single self-contained bundled `dist/index.mjs`.

## Non-goals (YAGNI)

- No local CLI / `bin` (explicitly out of scope).
- No mTLS / client certificates / `ignoreSsl` (custom undici dispatcher). Can be
  added later if requested.
- No `responseType: blob | arrayBuffer | stream` as a text output (binary bodies
  can be persisted via `responseFile`).

## Identity & tooling

- Action ref: `marr-cloud/ofetch-action@v1`. Marketplace name: "ofetch HTTP Request".
- Runtime: `node24` (`runs.using: node24`, `main: dist/index.mjs`).
- Build: **obuild** (rolldown). Configured to **inline runtime deps** (`ofetch`,
  `@actions/core`) so `dist/index.mjs` is fully self-contained. CI verifies the
  committed `dist` is in sync with source.
- Test: **vitest** + `@vitest/coverage-v8`.
- Lint/format: **oxlint** + **oxfmt**. Typecheck: **tsgo** (`@typescript/native-preview`).
- Package manager: pnpm. Docs badges via automd.

## Architecture

Small, isolated, independently testable modules:

| File | Responsibility | Depends on |
|---|---|---|
| `src/index.ts` | Thin entry. Wires real `@actions/core` + `ofetch` and calls `run()`. Bundle entrypoint. | core, ofetch, run |
| `src/inputs.ts` | Read & validate all inputs from env, return typed `ActionInputs`. Parse helpers (JSON object, CSV list, boolean). | `@actions/core` |
| `src/body.ts` | Body assembly: raw-string passthrough, multipart `FormData`, octet-stream. Home of the issue fixes. | `node:fs` |
| `src/request.ts` | Pure function building ofetch call options from `ActionInputs` (auth→headers, query, retry, timeout, retryStatusCodes, responseType). | body |
| `src/run.ts` | Orchestration: inputs → options → `ofetch.raw` → response/error handling → outputs / responseFile / mask. Receives injected `fetch` + `core` for testability. | request |

### `run()` signature (dependency injection)

```ts
interface CoreLike {
  getInput(name: string, opts?: { required?: boolean }): string;
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  setSecret(value: string): void;
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
}

async function run(core: CoreLike, fetch: typeof import("ofetch").ofetch): Promise<void>;
```

Booleans are parsed from `getInput` ourselves (not `getBooleanInput`) so that
optional booleans default to `false` when absent instead of throwing.

`src/index.ts` calls `run(core, ofetch)` with the real implementations.

## Inputs (native ofetch naming)

### Core

| Input | Type | Default | Notes |
|---|---|---|---|
| `url` | string | — (required) | Request URL (absolute, or relative to `baseURL`). |
| `method` | string | `GET` | HTTP method. |
| `baseURL` | string | — | Prepended to `url` with slash handling. |
| `body` | string | — | Request body. Sent **as-is** (see Body handling). |
| `query` | JSON object string | — | Query params, e.g. `'{"page":"1"}'`. |
| `headers` | JSON object string | — | Extra request headers. |
| `contentType` | string | `application/json` (for body-bearing methods) | Sets `Content-Type`. Ignored for multipart/octet-stream paths. |
| `timeout` | number (ms) | — | Aborts the request after N ms. |
| `retry` | number | ofetch default | Retry attempts. |
| `retryDelay` | number (ms) | ofetch default | Delay between retries. |
| `retryStatusCodes` | CSV | ofetch default | e.g. `429,500,503`. |
| `responseType` | `json` \| `text` | auto | Forces body parsing. Auto-detects when unset. |
| `ignoreResponseError` | boolean | `false` | Never fail on non-2xx; still set outputs. |

### Auth

| Input | Notes |
|---|---|
| `bearerToken` | → `Authorization: Bearer <token>`. |
| `username` + `password` | → `Authorization: Basic base64(user:pass)`. |

`bearerToken`/`password` are registered as secrets (`core.setSecret`) so they are
masked in logs.

### File uploads

| Input | Notes |
|---|---|
| `files` | JSON map of field → path **or array of paths**. Sent as `multipart/form-data`. Other `body` JSON fields are merged into the form. |
| `file` | Single file path. Sent as `application/octet-stream` with correct `Content-Type` + `Content-Length`. |

### Convenience

| Input | Notes |
|---|---|
| `responseFile` | Persist the response body to this path. |
| `maskResponse` | boolean. Emits `::add-mask::` for the response value. |
| `ignoreStatusCodes` | CSV of codes treated as success (no action failure). |
| `preventFailureOnNoResponse` | boolean. Network errors (no response) don't fail the action. |

## Outputs

| Output | Description |
|---|---|
| `response` | Response body. Parsed JSON → JSON string; text → raw string. |
| `headers` | Response headers as a JSON string. |
| `status` | Numeric HTTP status code. |
| `requestError` | On failure: JSON string `{ name, message, status, data }` derived from `FetchError`. Named `requestError` for clarity and migration parity with http-request-action; outputs are step-scoped (`steps.<id>.outputs.requestError`) so there is no cross-action collision. |

## Body handling (resolves the three issues)

Precedence: `file` > `files` > `body`.

1. **`file` present** → body = `await readFile(file)` (a `Buffer`); set
   `Content-Type: application/octet-stream`. ofetch does not re-serialize a Buffer
   (it has `.buffer`), and undici sets `Content-Length` automatically from the
   Buffer length. _(Fixes #226 — octet-stream headers were dropped by the
   reference action.)_
2. **`files` present** → build a `FormData`:
   - For each field whose value is a string: append the file once.
   - For each field whose value is an **array**: append every path under the same
     field name (repeated key). _(Fixes #120 — array of files per key.)_
   - Merge any scalar fields parsed from `body` (JSON) into the form.
   - Let the runtime set the multipart boundary `Content-Type` (do not override).
3. **`body` present (string)** → pass the **raw string** straight to ofetch.
   ofetch does **not** re-serialize a string body, so a JSON string containing
   `${{ secrets.* }}` is sent verbatim. Set `Content-Type` from `contentType`
   (default `application/json` for POST/PUT/PATCH). No `JSON.parse` + re-stringify.
   _(Fixes #182 — double-escaped JSON.)_ Optionally validate JSON and warn on
   mismatch when `contentType` is JSON.

## Failure semantics

`run()` lets ofetch perform its normal flow (retry-then-throw) and decides
failure in a `catch`. **It does not set `ignoreResponseError` globally** —
ofetch's retry on `retryStatusCodes` only runs on its error path, so forcing
`ignoreResponseError: true` would silently disable status-based retries
(verified in ofetch source). Flow:

- **Success (status < 400)** → `fetch.raw` resolves; set `response` / `headers` /
  `status`.
- **HTTP error (status ≥ 400, after retries)** → `fetch.raw` throws a
  `FetchError` carrying `.response`, `.status`, `.data`. Extract status / headers /
  body from it and set the outputs. Fail the action **unless** the status is in
  `ignoreStatusCodes`. Set `requestError` when failing.
- **No response (network error / timeout)** → thrown error has no `.response`.
  Set `requestError`; fail **unless** `preventFailureOnNoResponse` is true (then
  `core.warning`).
- **`ignoreResponseError: true` input** → passed through to ofetch so it never
  throws on status (status-based retry is intentionally skipped, matching ofetch
  semantics); outputs are set and the action never fails on status.

Retries (`retry`, `retryDelay`, `retryStatusCodes`) and `timeout` are handled by
ofetch natively.

## Proxy

No proxy input. ofetch (via undici) honours the standard `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` environment variables. **This will be documented in
the README** with an example of setting them on the step `env`.

## Testing strategy

### Unit (vitest)

- `inputs`: each input parsed; defaults; invalid-JSON errors; boolean coercion; CSV parsing.
- `body`:
  - raw JSON string passthrough — no double-escape (**#182**).
  - multipart `FormData` from a files map including an array value (**#120**).
  - single file → `Content-Type: application/octet-stream` + body is a `Buffer` (**#226**); the over-the-wire `Content-Length` is asserted in the integration test.
  - merge of scalar body fields into multipart.
- `request`: full option assembly — bearer/basic auth headers, query, retry,
  retryStatusCodes parsing, responseType.

### Integration (real network to a local server)

A throwaway `node:http` echo server (started in `beforeAll`) that:
- echoes method, headers, and body back;
- returns a chosen status code;
- can delay responses (timeout testing);
- can fail N times then succeed (retry testing).

Cases: GET/POST roundtrip, query params, custom headers, bearer & basic auth
received correctly, JSON body intact (**#182**), multipart received incl. array
field (**#120**), octet-stream content-type received (**#226**), real retry on 503,
timeout abort, `ignoreResponseError` / `ignoreStatusCodes` /
`preventFailureOnNoResponse` behaviour, `responseType` text vs json, outputs set,
`responseFile` written, `maskResponse` emits `::add-mask::`.

### Orchestration

`run()` tested with injected fake `core` + fake `fetch`. Plus one end-to-end test
driving via real `INPUT_*` env vars and real `@actions/core` writing to a temp
`GITHUB_OUTPUT` file. Coverage via v8.

## Repo / CI / docs

- `action.yml` — full inputs/outputs + branding.
- `.github/workflows/checks.yml` — lint (oxlint + oxfmt --check), typecheck (tsgo),
  test + coverage, build (obuild), and **verify committed `dist` is in sync**
  (`git diff --exit-code dist`).
- **Self-test job** that actually uses the built action against a runner-local
  echo server (real end-to-end exercise of `action.yml`). Runs on the
  `marr-cloud/gh-runner` self-hosted runner (WSL/Docker) so it costs no
  GitHub-hosted minutes. Guarded so external contributors / forks fall back to
  skipping it (the self-hosted runner won't be available there).
- `README.md` — rewritten: all inputs/outputs with examples, proxy note, and a
  migration table from http-request-action.
- `AGENTS.md` — updated with project status (per repo convention).

## Files created / modified

- `action.yml` (replace placeholder)
- `src/index.ts` (rewrite as entry), `src/inputs.ts`, `src/body.ts`,
  `src/request.ts`, `src/run.ts` (new)
- `build.config.ts` (entry `src/index.ts`, inline runtime deps, output `dist/index.mjs`)
- `test/*.test.ts` (unit + integration), `test/helpers/server.ts` (echo server)
- `package.json` (name, repository, runtime deps, scripts)
- `README.md`, `AGENTS.md`
- `.github/workflows/checks.yml` (update)
