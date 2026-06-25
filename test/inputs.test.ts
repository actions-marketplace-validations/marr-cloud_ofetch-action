import { describe, expect, it } from "vitest";
import {
  parseBoolean,
  parseFiles,
  parseJsonObject,
  parseNumber,
  parseNumberList,
} from "../src/inputs.ts";

describe("parseBoolean", () => {
  it("treats empty as false", () => {
    expect(parseBoolean("")).toBe(false);
  });
  it("parses true/false case-insensitively", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("FALSE")).toBe(false);
  });
  it("throws on invalid value", () => {
    expect(() => parseBoolean("yes")).toThrow();
  });
});

describe("parseNumber", () => {
  it("returns undefined for empty", () => {
    expect(parseNumber("", "timeout")).toBeUndefined();
  });
  it("parses an integer", () => {
    expect(parseNumber("5000", "timeout")).toBe(5000);
  });
  it("throws on NaN", () => {
    expect(() => parseNumber("abc", "timeout")).toThrow();
  });
});

describe("parseNumberList", () => {
  it("returns undefined for empty", () => {
    expect(parseNumberList("")).toBeUndefined();
  });
  it("parses a comma list with spaces", () => {
    expect(parseNumberList("429, 500 ,503")).toEqual([429, 500, 503]);
  });
  it("throws on a non-number entry", () => {
    expect(() => parseNumberList("200,oops")).toThrow();
  });
});

describe("parseJsonObject", () => {
  it("returns undefined for empty", () => {
    expect(parseJsonObject("", "query")).toBeUndefined();
  });
  it("parses an object", () => {
    expect(parseJsonObject('{"a":"1"}', "query")).toEqual({ a: "1" });
  });
  it("throws on invalid JSON", () => {
    expect(() => parseJsonObject("{nope}", "query")).toThrow();
  });
  it("throws on a JSON array", () => {
    expect(() => parseJsonObject("[1,2]", "query")).toThrow();
  });
});

describe("parseFiles", () => {
  it("accepts string and array values", () => {
    expect(parseFiles('{"a":"x.txt","b":["y.txt","z.txt"]}')).toEqual({
      a: "x.txt",
      b: ["y.txt", "z.txt"],
    });
  });
  it("throws on a non-string array element", () => {
    expect(() => parseFiles('{"a":[1]}')).toThrow();
  });
});

import { type InputReader, readInputs } from "../src/inputs.ts";

function reader(values: Record<string, string>): InputReader {
  return {
    getInput(name, options) {
      const value = values[name] ?? "";
      if (options?.required && value === "") {
        throw new Error(`Input required and not supplied: ${name}`);
      }
      return value;
    },
  };
}

describe("readInputs", () => {
  it("applies defaults", () => {
    const inputs = readInputs(reader({ url: "https://x.test" }));
    expect(inputs.url).toBe("https://x.test");
    expect(inputs.method).toBe("GET");
    expect(inputs.contentType).toBe("application/json");
    expect(inputs.headers).toEqual({});
    expect(inputs.ignoreResponseError).toBe(false);
    expect(inputs.maskResponse).toBe(false);
    expect(inputs.preventFailureOnNoResponse).toBe(false);
  });

  it("throws when url is missing", () => {
    expect(() => readInputs(reader({}))).toThrow(/url/);
  });

  it("parses the full set", () => {
    const inputs = readInputs(
      reader({
        url: "https://x.test",
        method: "post",
        baseURL: "https://api.test",
        body: '{"a":1}',
        query: '{"page":"2"}',
        headers: '{"X-Test":"1"}',
        contentType: "text/plain",
        timeout: "5000",
        retry: "3",
        retryDelay: "1000",
        retryStatusCodes: "500,503",
        responseType: "text",
        ignoreResponseError: "true",
        bearerToken: "tok",
        ignoreStatusCodes: "404",
        maskResponse: "true",
      }),
    );
    expect(inputs.method).toBe("post");
    expect(inputs.baseURL).toBe("https://api.test");
    expect(inputs.query).toEqual({ page: "2" });
    expect(inputs.headers).toEqual({ "X-Test": "1" });
    expect(inputs.contentType).toBe("text/plain");
    expect(inputs.timeout).toBe(5000);
    expect(inputs.retry).toBe(3);
    expect(inputs.retryDelay).toBe(1000);
    expect(inputs.retryStatusCodes).toEqual([500, 503]);
    expect(inputs.responseType).toBe("text");
    expect(inputs.ignoreResponseError).toBe(true);
    expect(inputs.bearerToken).toBe("tok");
    expect(inputs.ignoreStatusCodes).toEqual([404]);
    expect(inputs.maskResponse).toBe(true);
  });

  it("rejects an invalid responseType", () => {
    expect(() => readInputs(reader({ url: "https://x.test", responseType: "xml" }))).toThrow();
  });
});
