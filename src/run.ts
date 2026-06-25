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
      await emitResponse(
        core,
        inputs,
        response.status,
        headersToObject(response.headers),
        response._data,
      );
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
