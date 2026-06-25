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
  } else if (inputs.username && inputs.password) {
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
