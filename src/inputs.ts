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
      throw new Error(
        `Invalid "files" entry "${key}": expected a path string or array of path strings`,
      );
    }
  }
  return result;
}

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
