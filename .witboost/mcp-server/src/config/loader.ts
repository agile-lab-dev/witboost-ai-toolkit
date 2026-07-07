import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { buildConfig, type WitboostConfig, type RawConfigFile } from "./schema.js";

/**
 * Read key=value pairs from a .env file.
 * Ignores comments (#) and blank lines. Does NOT override existing env vars.
 */
export function loadDotEnv(repoRoot?: string): void {
  const root = repoRoot ?? process.cwd();
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't override existing non-empty env vars
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Read the Witboost token from the token.json file saved by the login flow.
 * Returns undefined if the file doesn't exist or the token has expired.
 */
function readTokenFile(witboostDir: string): string | undefined {
  const tokenPath = resolve(witboostDir, "token.json");
  if (!existsSync(tokenPath)) return undefined;

  try {
    const raw = JSON.parse(readFileSync(tokenPath, "utf-8")) as {
      token?: string;
      access_token?: string;
      expiresAt?: number;
    };
    const token = raw.token ?? raw.access_token;
    if (!token) return undefined;

    // Check expiration if available
    if (raw.expiresAt && Date.now() > raw.expiresAt) {
      return undefined;
    }

    return token;
  } catch {
    return undefined;
  }
}

/**
 * Load configuration from layered sources:
 * 1. Built-in defaults
 * 2. .env file (loaded into process.env, doesn't override existing vars)
 * 3. .witboost/config.yml (if present)
 * 4. .witboost/token.json (JWT from SSO login — fallback)
 * 5. Environment variables / PAT from .env (highest priority)
 */
export function loadConfig(configPath?: string): WitboostConfig {
  const filePath = configPath ?? resolve(process.cwd(), ".witboost", "config.yml");
  const witboostDir = dirname(filePath);
  const repoRoot = resolve(witboostDir, "..");

  // Layer 2: load .env into process.env (won't override existing vars)
  loadDotEnv(repoRoot);

  // Layer 3: project config file
  let fileConfig: RawConfigFile = {};
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    fileConfig = (parseYaml(raw) as RawConfigFile) ?? {};
  }

  // Layer 3: environment variables (override everything)
  const env = process.env;

  const baseUrl = env.WITBOOST_BASE_URL ?? fileConfig.api?.baseUrl;
  const token = env.WITBOOST_TOKEN || readTokenFile(witboostDir);
  const rawHasuraJwt = env.WITBOOST_HASURA_JWT;
  const hasuraJwt = rawHasuraJwt?.replace(/^Bearer\s+/i, "") || undefined;
  const hasuraUrl = env.WITBOOST_HASURA_URL || undefined;
  const apiVersion = env.WITBOOST_API_VERSION ?? fileConfig.api?.version;
  const rawTimeout = env.WITBOOST_API_TIMEOUT ?? fileConfig.api?.timeout;
  const requestTimeout = rawTimeout !== undefined ? Number(rawTimeout) : undefined;
  const defaultDomain = env.WITBOOST_DEFAULT_DOMAIN ?? fileConfig.defaults?.domain;
  const defaultEnvironment = env.WITBOOST_DEFAULT_ENVIRONMENT ?? fileConfig.defaults?.environment;

  return buildConfig({
    baseUrl,
    token,
    hasuraJwt,
    hasuraUrl,
    defaultDomain,
    defaultEnvironment,
    apiVersion,
    requestTimeout,
  });
}
