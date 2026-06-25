import { core_exports, ofetch } from "./_chunks/libs/common.mjs";
import { Buffer } from "node:buffer";
import { basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
function parseBoolean(value) {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "false") return false;
  if (v === "true") return true;
  throw new Error(`Invalid boolean value: "${value}" (expected "true" or "false")`);
}
function parseNumber(value, name) {
  const v = value.trim();
  if (v === "") return void 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Invalid number for "${name}": "${value}"`);
  return n;
}
function parseNumberList(value) {
  const v = value.trim();
  if (v === "") return void 0;
  return v.split(",").map((part) => {
    const n = Number(part.trim());
    if (Number.isNaN(n)) throw new Error(`Invalid number in list: "${part}"`);
    return n;
  });
}
function parseJsonObject(value, name) {
  const v = value.trim();
  if (v === "") return void 0;
  let parsed;
  try {
    parsed = JSON.parse(v);
  } catch (error) {
    throw new Error(`Invalid JSON for "${name}": ${error.message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error(`Expected a JSON object for "${name}"`);
  return parsed;
}
function parseFiles(value) {
  const obj = parseJsonObject(value, "files");
  if (!obj) return void 0;
  const result = {};
  for (const [key, val] of Object.entries(obj))
    if (typeof val === "string") result[key] = val;
    else if (Array.isArray(val) && val.every((p) => typeof p === "string")) result[key] = val;
    else
      throw new Error(
        `Invalid "files" entry "${key}": expected a path string or array of path strings`,
      );
  return result;
}
function optional(value) {
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
}
function parseResponseType(value) {
  const v = value.trim().toLowerCase();
  if (v === "") return void 0;
  if (v === "json" || v === "text") return v;
  throw new Error(`Invalid responseType: "${value}" (expected "json" or "text")`);
}
function readInputs(core) {
  const get = (name) => core.getInput(name);
  return {
    url: core.getInput("url", { required: true }),
    method: optional(get("method")) ?? "GET",
    baseURL: optional(get("baseURL")),
    body: optional(get("body")),
    query: parseJsonObject(get("query"), "query"),
    headers: parseJsonObject(get("headers"), "headers") ?? {},
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
async function fileToBlob(path) {
  const buffer = await readFile(path);
  return new Blob([buffer]);
}
async function buildBody(inputs) {
  if (inputs.file)
    return {
      body: await readFile(inputs.file),
      headers: { "content-type": "application/octet-stream" },
    };
  if (inputs.files) {
    const form = new FormData();
    if (inputs.body) {
      const badBodyMsg = '"body" must be a JSON object of scalar fields when "files" is set';
      let fields;
      try {
        const parsed = JSON.parse(inputs.body);
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
          throw new Error(badBodyMsg);
        fields = parsed;
      } catch (err) {
        if (err instanceof Error && err.message === badBodyMsg) throw err;
        throw new Error(badBodyMsg);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
          throw new Error(`"body" field "${key}" must be a scalar value when "files" is set`);
        form.append(key, String(value));
      }
    }
    for (const [field, value] of Object.entries(inputs.files)) {
      const paths = Array.isArray(value) ? value : [value];
      for (const path of paths) form.append(field, await fileToBlob(path), basename(path));
    }
    return {
      body: form,
      headers: {},
    };
  }
  if (inputs.body !== void 0) {
    const headers = {};
    if (inputs.contentType) headers["content-type"] = inputs.contentType;
    return {
      body: inputs.body,
      headers,
    };
  }
  return { headers: {} };
}
async function buildRequest(inputs) {
  const { body, headers: bodyHeaders } = await buildBody(inputs);
  const headers = {
    ...inputs.headers,
    ...bodyHeaders,
  };
  if (inputs.bearerToken) headers["authorization"] = `Bearer ${inputs.bearerToken}`;
  else if (inputs.username && inputs.password)
    headers["authorization"] =
      `Basic ${Buffer.from(`${inputs.username}:${inputs.password}`).toString("base64")}`;
  const options = {
    method: inputs.method,
    headers,
  };
  if (body !== void 0) options.body = body;
  if (inputs.baseURL) options.baseURL = inputs.baseURL;
  if (inputs.query) options.query = inputs.query;
  if (inputs.timeout !== void 0) options.timeout = inputs.timeout;
  if (inputs.retry !== void 0) options.retry = inputs.retry;
  if (inputs.retryDelay !== void 0) options.retryDelay = inputs.retryDelay;
  if (inputs.retryStatusCodes) options.retryStatusCodes = inputs.retryStatusCodes;
  if (inputs.responseType) options.responseType = inputs.responseType;
  return {
    url: inputs.url,
    options,
  };
}
function headersToObject(headers) {
  return Object.fromEntries(headers.entries());
}
function serializeBody(data) {
  if (data === void 0 || data === null) return "";
  return typeof data === "string" ? data : JSON.stringify(data);
}
function serializeError(error, status) {
  return JSON.stringify({
    name: error.name,
    message: error.message,
    status: status ?? error.status,
    data: error.data,
  });
}
async function emitResponse(core, inputs, status, headers, data) {
  const responseString = serializeBody(data);
  if (inputs.maskResponse && responseString) core.setSecret(responseString);
  core.setOutput("response", responseString);
  core.setOutput("headers", JSON.stringify(headers));
  core.setOutput("status", String(status));
  if (inputs.responseFile) await writeFile(inputs.responseFile, responseString);
}
async function run(core, fetch) {
  try {
    const inputs = readInputs(core);
    if (inputs.bearerToken) core.setSecret(inputs.bearerToken);
    if (inputs.password) core.setSecret(inputs.password);
    const { url, options } = await buildRequest(inputs);
    if (inputs.ignoreResponseError) options.ignoreResponseError = true;
    try {
      const response = await fetch.raw(url, options);
      await emitResponse(
        core,
        inputs,
        response.status,
        headersToObject(response.headers),
        response._data,
      );
    } catch (error) {
      const fetchError = error;
      if (fetchError.response) {
        const status = fetchError.status ?? fetchError.response.status;
        await emitResponse(
          core,
          inputs,
          status,
          headersToObject(fetchError.response.headers),
          fetchError.data ?? fetchError.response._data,
        );
        if (inputs.ignoreStatusCodes?.includes(status)) {
          core.info(`Ignoring status code ${status}`);
          return;
        }
        core.setOutput("requestError", serializeError(fetchError, status));
        core.setFailed(`Request to ${url} failed with status ${status}`);
        return;
      }
      if (inputs.preventFailureOnNoResponse) {
        core.warning(`No response received: ${fetchError.message}`);
        return;
      }
      core.setOutput("requestError", serializeError(fetchError));
      core.setFailed(fetchError.message);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
await run(core_exports, ofetch);
export {};
