/** Validated Witboost configuration */
export interface WitboostConfig {
  baseUrl: string;
  token: string;
  /** Optional JWT with Hasura claims — used for direct Hasura GraphQL calls */
  hasuraJwt?: string;
  /** Explicit Hasura GraphQL endpoint. If not set, derived from baseUrl (ui.X → hasura.X). */
  hasuraUrl?: string;
  defaultDomain: string;
  defaultEnvironment: string;
  apiVersion: string;
  requestTimeout: number;
}

/** Raw shape of .witboost/config.yml */
export interface RawConfigFile {
  api?: {
    baseUrl?: string;
    version?: string;
    timeout?: number;
  };
  defaults?: {
    domain?: string;
    environment?: string;
  };
  harness?: {
    targets?: string[];
  };
  agents?: {
    includeCustom?: boolean;
  };
}

/** Built-in defaults */
export const CONFIG_DEFAULTS: Omit<WitboostConfig, "baseUrl" | "token"> = {
  defaultDomain: "",
  defaultEnvironment: "",
  apiVersion: "v1",
  requestTimeout: 30_000,
};

/** Validate a base URL */
export function validateBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid URL scheme: ${parsed.protocol} — must be http or https`);
    }
    // Strip trailing slash
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`Invalid URL: ${url}`);
    }
    throw e;
  }
}

/** Validate and build a WitboostConfig from raw values */
export function buildConfig(raw: {
  baseUrl?: string;
  token?: string;
  hasuraJwt?: string;
  hasuraUrl?: string;
  defaultDomain?: string;
  defaultEnvironment?: string;
  apiVersion?: string;
  requestTimeout?: number;
}): WitboostConfig {
  if (!raw.baseUrl) {
    throw new Error(
      "Missing required configuration: baseUrl. Set WITBOOST_BASE_URL or api.baseUrl in config.yml",
    );
  }
  if (!raw.token) {
    throw new Error(
      "Missing required configuration: token. Set the WITBOOST_TOKEN environment variable",
    );
  }

  const baseUrl = validateBaseUrl(raw.baseUrl);

  const apiVersion = raw.apiVersion ?? CONFIG_DEFAULTS.apiVersion;
  if (!/^v\d+$/.test(apiVersion)) {
    throw new Error(`Invalid API version: ${apiVersion} — must match pattern v<number>`);
  }

  const requestTimeout = raw.requestTimeout ?? CONFIG_DEFAULTS.requestTimeout;
  if (!Number.isInteger(requestTimeout) || requestTimeout <= 0) {
    throw new Error(`Invalid request timeout: ${requestTimeout} — must be a positive integer`);
  }

  return {
    baseUrl,
    token: raw.token,
    hasuraJwt: raw.hasuraJwt || undefined,
    hasuraUrl: raw.hasuraUrl || undefined,
    defaultDomain: raw.defaultDomain ?? CONFIG_DEFAULTS.defaultDomain,
    defaultEnvironment: raw.defaultEnvironment ?? CONFIG_DEFAULTS.defaultEnvironment,
    apiVersion,
    requestTimeout,
  };
}
