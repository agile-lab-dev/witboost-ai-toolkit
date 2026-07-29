import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, normalizeGitHost } from "../../../src/config/loader.js";
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

describe("normalizeGitHost", () => {
  it("returns gitlab.com for undefined", () => {
    expect(normalizeGitHost(undefined)).toBe("gitlab.com");
  });

  it("returns gitlab.com for empty string", () => {
    expect(normalizeGitHost("")).toBe("gitlab.com");
  });

  it("returns bare hostname unchanged", () => {
    expect(normalizeGitHost("gitlab.mycompany.com")).toBe("gitlab.mycompany.com");
  });

  it("strips https:// scheme prefix", () => {
    expect(normalizeGitHost("https://gitlab.mycompany.com")).toBe("gitlab.mycompany.com");
  });

  it("strips http:// scheme prefix", () => {
    expect(normalizeGitHost("http://gitlab.mycompany.com")).toBe("gitlab.mycompany.com");
  });

  it("strips git@ prefix", () => {
    expect(normalizeGitHost("git@gitlab.mycompany.com")).toBe("gitlab.mycompany.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeGitHost("gitlab.mycompany.com/")).toBe("gitlab.mycompany.com");
  });

  it("strips https:// and trailing slash together", () => {
    expect(normalizeGitHost("https://gitlab.mycompany.com/")).toBe("gitlab.mycompany.com");
  });

  it("preserves port number", () => {
    expect(normalizeGitHost("gitlab.mycompany.com:8080")).toBe("gitlab.mycompany.com:8080");
  });
});

describe("loadConfig — gitHost", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.WITBOOST_BASE_URL = "https://test.witboost.com";
    process.env.WITBOOST_TOKEN = "test-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults gitHost to gitlab.com when GIT_BASE_URL is not set", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.GIT_BASE_URL;

    const config = loadConfig();
    expect(config.gitHost).toBe("gitlab.com");
  });

  it("resolves gitHost from GIT_BASE_URL env var", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GIT_BASE_URL = "gitlab.mycompany.com";

    const config = loadConfig();
    expect(config.gitHost).toBe("gitlab.mycompany.com");
  });

  it("normalizes GIT_BASE_URL by stripping https:// scheme", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GIT_BASE_URL = "https://gitlab.mycompany.com";

    const config = loadConfig();
    expect(config.gitHost).toBe("gitlab.mycompany.com");
  });

  it("GIT_BASE_URL env var takes priority over git.baseUrl in config.yml", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
git:
  baseUrl: "gitlab.from-file.com"
`);
    process.env.GIT_BASE_URL = "gitlab.from-env.com";

    const config = loadConfig("/fake/config.yml");
    expect(config.gitHost).toBe("gitlab.from-env.com");
  });

  it("reads gitHost from git.baseUrl in config.yml when env var absent", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
git:
  baseUrl: "gitlab.from-file.com"
`);
    delete process.env.GIT_BASE_URL;

    const config = loadConfig("/fake/config.yml");
    expect(config.gitHost).toBe("gitlab.from-file.com");
  });
});
