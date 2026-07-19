import { describe, expect, it } from "vitest";
import {
  buildIdentity,
  isTruthyEnvValue,
  pickDefinedFields,
  requireIdentityOption
} from "../utils/shared-helpers.js";

describe("shared-helpers", () => {
  describe("buildIdentity", () => {
    it("builds identity from session and agent name", () => {
      expect(buildIdentity("my-session", "worker-1")).toBe("my-session::worker-1");
    });

    it("handles empty strings", () => {
      expect(buildIdentity("", "")).toBe("::");
    });
  });

  describe("requireIdentityOption", () => {
    it("returns the identity when provided", () => {
      expect(requireIdentityOption("my-identity")).toBe("my-identity");
    });

    it("throws when identity is undefined", () => {
      expect(() => requireIdentityOption(undefined)).toThrow("必须显式提供 --identity");
    });

    it("throws when identity is empty string", () => {
      expect(() => requireIdentityOption("")).toThrow("必须显式提供 --identity");
    });
  });

  describe("isTruthyEnvValue", () => {
    it("returns true for common truthy values", () => {
      expect(isTruthyEnvValue("1")).toBe(true);
      expect(isTruthyEnvValue("true")).toBe(true);
      expect(isTruthyEnvValue("TRUE")).toBe(true);
      expect(isTruthyEnvValue("yes")).toBe(true);
      expect(isTruthyEnvValue("on")).toBe(true);
    });

    it("returns false for falsy values", () => {
      expect(isTruthyEnvValue(undefined)).toBe(false);
      expect(isTruthyEnvValue("")).toBe(false);
      expect(isTruthyEnvValue("0")).toBe(false);
      expect(isTruthyEnvValue("false")).toBe(false);
      expect(isTruthyEnvValue("no")).toBe(false);
    });

    it("is case-insensitive and trims whitespace", () => {
      expect(isTruthyEnvValue("  True  ")).toBe(true);
      expect(isTruthyEnvValue("  YES  ")).toBe(true);
    });
  });

  describe("pickDefinedFields", () => {
    it("picks only defined fields", () => {
      const source = { a: 1, b: undefined, c: "hello", d: null };
      const result = pickDefinedFields(source, ["a", "b", "c", "d", "e"]);
      expect(result).toEqual({ a: 1, c: "hello", d: null });
    });

    it("returns empty object for empty source", () => {
      const result = pickDefinedFields({}, ["a", "b"]);
      expect(result).toEqual({});
    });

    it("returns empty object for empty keys", () => {
      const result = pickDefinedFields({ a: 1 }, []);
      expect(result).toEqual({});
    });
  });
});
