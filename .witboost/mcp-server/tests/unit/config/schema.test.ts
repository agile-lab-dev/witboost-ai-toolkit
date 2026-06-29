import { describe, it, expect } from "vitest";
import { buildConfig, validateBaseUrl } from "../../../src/config/schema.js";

describe("validateBaseUrl", () => {
  it("accepts https URLs", () => {
    expect(validateBaseUrl("https://witboost.example.com")).toBe(
      "https://witboost.example.com",
    );
  });

  it("accepts http URLs", () => {
    expect(validateBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes", () => {
    expect(validateBaseUrl("https://witboost.example.com/")).toBe(
      "https://witboost.example.com",
    );
  });

  it("rejects non-http schemes", () => {
    expect(() => validateBaseUrl("ftp://example.com")).toThrow("Invalid URL scheme");
  });

  it("rejects invalid URLs", () => {
    expect(() => validateBaseUrl("not-a-url")).toThrow("Invalid URL");
  });
});

describe("buildConfig", () => {
  it("builds a valid config with required fields", () => {
    const config = buildConfig({
      baseUrl: "https://witboost.example.com",
      token: "test-token",
    });
    expect(config.baseUrl).toBe("https://witboost.example.com");
    expect(config.token).toBe("test-token");
    expect(config.apiVersion).toBe("v1");
    expect(config.requestTimeout).toBe(30_000);
    expect(config.defaultDomain).toBe("");
    expect(config.defaultEnvironment).toBe("");
  });

  it("throws when baseUrl is missing", () => {
    expect(() => buildConfig({ token: "test" })).toThrow("Missing required configuration: baseUrl");
  });

  it("throws when token is missing", () => {
    expect(() => buildConfig({ baseUrl: "https://example.com" })).toThrow(
      "Missing required configuration: token",
    );
  });

  it("validates apiVersion format", () => {
    expect(() =>
      buildConfig({
        baseUrl: "https://example.com",
        token: "t",
        apiVersion: "2",
      }),
    ).toThrow("Invalid API version");
  });

  it("accepts custom apiVersion", () => {
    const config = buildConfig({
      baseUrl: "https://example.com",
      token: "t",
      apiVersion: "v2",
    });
    expect(config.apiVersion).toBe("v2");
  });

  it("validates requestTimeout is positive", () => {
    expect(() =>
      buildConfig({
        baseUrl: "https://example.com",
        token: "t",
        requestTimeout: -1,
      }),
    ).toThrow("Invalid request timeout");
  });

  it("applies all overrides", () => {
    const config = buildConfig({
      baseUrl: "https://example.com",
      token: "t",
      defaultDomain: "finance",
      defaultEnvironment: "staging",
      apiVersion: "v3",
      requestTimeout: 5000,
    });
    expect(config.defaultDomain).toBe("finance");
    expect(config.defaultEnvironment).toBe("staging");
    expect(config.apiVersion).toBe("v3");
    expect(config.requestTimeout).toBe(5000);
  });
});
