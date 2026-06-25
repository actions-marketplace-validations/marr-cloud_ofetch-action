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

| Input                        | Default            | Description                                                       |
| ---------------------------- | ------------------ | ----------------------------------------------------------------- |
| `url` (required)             | —                  | Request URL (absolute, or relative to `baseURL`).                 |
| `method`                     | `GET`              | HTTP method.                                                      |
| `baseURL`                    | —                  | Base URL prepended to `url`.                                      |
| `body`                       | —                  | Request body. Sent as-is — a JSON string is **not** re-encoded.   |
| `query`                      | —                  | Query params as a JSON object string, e.g. `'{"page":"1"}'`.      |
| `headers`                    | —                  | Extra headers as a JSON object string.                            |
| `contentType`                | `application/json` | `Content-Type` for the body.                                      |
| `timeout`                    | —                  | Timeout in milliseconds.                                          |
| `retry`                      | —                  | Retry attempts on failure.                                        |
| `retryDelay`                 | —                  | Delay between retries (ms).                                       |
| `retryStatusCodes`           | —                  | Comma-separated codes that trigger a retry, e.g. `429,500,503`.   |
| `responseType`               | auto               | Force `json` or `text`.                                           |
| `ignoreResponseError`        | `false`            | Don't fail on non-2xx (also skips status-based retry).            |
| `bearerToken`                | —                  | Bearer token (no `Bearer ` prefix).                               |
| `username` / `password`      | —                  | Basic authentication.                                             |
| `files`                      | —                  | JSON map of field → path or array of paths (multipart/form-data). |
| `file`                       | —                  | Single file path (application/octet-stream).                      |
| `responseFile`               | —                  | Persist the response body to this path.                           |
| `maskResponse`               | `false`            | Mask the response value in logs.                                  |
| `ignoreStatusCodes`          | —                  | Comma-separated codes treated as success.                         |
| `preventFailureOnNoResponse` | `false`            | Don't fail on a network error.                                    |

## Outputs

| Output         | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| `response`     | Response body (JSON string or raw text).                              |
| `headers`      | Response headers as a JSON object string.                             |
| `status`       | HTTP status code.                                                     |
| `requestError` | Set only when the step fails: JSON `{ name, message, status, data }`. |

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

| http-request-action          | ofetch-action                                 |
| ---------------------------- | --------------------------------------------- |
| `data`                       | `body`                                        |
| `customHeaders`              | `headers`                                     |
| `retryWait`                  | `retryDelay`                                  |
| `bearerToken`                | `bearerToken` (same)                          |
| `username` / `password`      | `username` / `password` (same)                |
| `files` / `file`             | `files` / `file` (same; arrays now supported) |
| `ignoreStatusCodes`          | `ignoreStatusCodes` (same)                    |
| `responseFile`               | `responseFile` (same)                         |
| `maskResponse`               | `maskResponse` (same)                         |
| `preventFailureOnNoResponse` | `preventFailureOnNoResponse` (same)           |
| output `requestError`        | output `requestError` (same)                  |

> mTLS / client-certificate inputs (`httpsCA`, `httpsCert`, `httpsKey`, `ignoreSsl`) are not supported.

## Development

- Install [Node.js](https://nodejs.org/) and enable Corepack: `corepack enable`
- `pnpm install`
- `pnpm dev` — watch tests
- `pnpm test` — lint + typecheck + tests with coverage
- `pnpm build` — bundle to `dist/` (committed; the action runs `dist/index.mjs`)

## License

Published under the [MIT](./LICENSE) license.
