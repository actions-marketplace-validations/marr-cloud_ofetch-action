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
      requests.push({
        method: req.method ?? "GET",
        path: url.pathname,
        headers: req.headers,
        body,
      });

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
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
