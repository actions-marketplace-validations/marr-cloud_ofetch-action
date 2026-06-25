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
