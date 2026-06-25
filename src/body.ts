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
      const badBodyMsg = '"body" must be a JSON object of scalar fields when "files" is set';
      let fields: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(inputs.body);
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error(badBodyMsg);
        }
        fields = parsed as Record<string, unknown>;
      } catch (err) {
        if (err instanceof Error && err.message === badBodyMsg) throw err;
        throw new Error(badBodyMsg);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new Error(`"body" field "${key}" must be a scalar value when "files" is set`);
        }
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
