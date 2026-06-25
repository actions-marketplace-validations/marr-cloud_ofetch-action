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
