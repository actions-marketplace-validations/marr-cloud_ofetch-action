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
    const { options } = await buildRequest(
      baseInputs({ bearerToken: "tok", username: "u", password: "p" }),
    );
    expect((options.headers as Record<string, string>)["authorization"]).toBe("Bearer tok");
  });

  it("ignores empty basic credentials", async () => {
    const { options } = await buildRequest(baseInputs({ username: "", password: "" }));
    expect((options.headers as Record<string, string>)["authorization"]).toBeUndefined();
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
