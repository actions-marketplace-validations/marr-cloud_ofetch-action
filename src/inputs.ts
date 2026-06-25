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
