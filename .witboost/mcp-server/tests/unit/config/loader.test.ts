import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../../src/config/loader.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    // Set required env vars for all tests
    process.env.WITBOOST_BASE_URL = "https://test.witboost.com";
    process.env.WITBOOST_TOKEN = "test-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads config from environment variables", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();
    expect(config.baseUrl).toBe("https://test.witboost.com");
    expect(config.token).toBe("test-token");
  });

  it("merges config file with env vars (env wins)", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
api:
  baseUrl: "https://from-file.witboost.com"
  version: "v2"
  timeout: 5000
defaults:
  domain: "finance"
  environment: "staging"
`);

    const config = loadConfig("/fake/config.yml");
    // env vars win for baseUrl
    expect(config.baseUrl).toBe("https://test.witboost.com");
    // file values used for non-env fields
    expect(config.apiVersion).toBe("v2");
    expect(config.requestTimeout).toBe(5000);
    expect(config.defaultDomain).toBe("finance");
    expect(config.defaultEnvironment).toBe("staging");
  });

  it("uses env overrides for optional values", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.WITBOOST_API_VERSION = "v5";
    process.env.WITBOOST_API_TIMEOUT = "10000";
    process.env.WITBOOST_DEFAULT_DOMAIN = "marketing";
    process.env.WITBOOST_DEFAULT_ENVIRONMENT = "production";

    const config = loadConfig();
    expect(config.apiVersion).toBe("v5");
    expect(config.requestTimeout).toBe(10000);
    expect(config.defaultDomain).toBe("marketing");
    expect(config.defaultEnvironment).toBe("production");
  });

  it("throws when baseUrl is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.WITBOOST_BASE_URL;

    expect(() => loadConfig()).toThrow("Missing required configuration: baseUrl");
  });

  it("throws when token is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.WITBOOST_TOKEN;

    expect(() => loadConfig()).toThrow("Missing required configuration: token");
  });
});
