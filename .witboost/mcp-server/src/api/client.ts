import type { WitboostConfig } from "../config/schema.js";
import type { ApiResponse, ApiError } from "./types.js";

/** Duration of exchanged JWTs in seconds */
const JWT_DURATION_SECONDS = 3600;
/** Refresh JWT when less than this many ms remain */
const JWT_REFRESH_MARGIN_MS = 60_000;

export class WitboostApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly timeout: number;

  /** Cached JWT obtained by exchanging the access token */
  private jwt: string | undefined;
  /** When the cached JWT expires (epoch ms) */
  private jwtExpiresAt = 0;
  /** Cached JWTs keyed by requested scope */
  private readonly scopedJwts = new Map<string, { jwt: string; expiresAt: number }>();

  constructor(config: WitboostConfig) {
    this.baseUrl = config.baseUrl;
    this.accessToken = config.token;
    this.timeout = config.requestTimeout;
  }

  /**
   * Returns a valid Bearer token.
   * If the configured token is a PAT (wbat-…), exchanges it for a short-lived
   * JWT via /api/auth/access-tokens/jwt (caching + auto-refresh).
   * If the token is already a JWT, returns it as-is.
   */
  async getBearerToken(): Promise<string> {
    // Non-PAT tokens (e.g. JWTs from SSO login) are used directly
    if (!this.accessToken.startsWith("wbat-")) {
      return this.accessToken;
    }

    // Return cached JWT if still valid
    if (this.jwt && Date.now() < this.jwtExpiresAt - JWT_REFRESH_MARGIN_MS) {
      return this.jwt;
    }

    try {
      this.jwt = await this.exchangeAccessTokenForJwt();
      this.jwtExpiresAt = Date.now() + JWT_DURATION_SECONDS * 1000;
      return this.jwt;
    } catch (err) {
      throw new Error(
        `Failed to exchange PAT for JWT: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Returns a valid Bearer token containing the requested scope claim.
   * PAT tokens are exchanged through /access-tokens/jwt; existing JWT/SSO
   * tokens are exchanged through /session-tokens/jwt using the token itself.
   */
  async getScopedBearerToken(scope: string): Promise<string> {
    if (this.tokenHasScope(this.accessToken, scope)) {
      return this.accessToken;
    }

    const cached = this.scopedJwts.get(scope);
    if (cached && Date.now() < cached.expiresAt - JWT_REFRESH_MARGIN_MS) {
      return cached.jwt;
    }

    const scopedJwt = this.accessToken.startsWith("wbat-")
      ? await this.exchangeAccessTokenForJwt(scope)
      : await this.exchangeSessionTokenForJwt(scope);

    this.scopedJwts.set(scope, {
      jwt: scopedJwt,
      expiresAt: this.jwtExpiresAtFromToken(scopedJwt) ?? Date.now() + JWT_DURATION_SECONDS * 1000,
    });
    return scopedJwt;
  }

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, query);
    return this.request<T>(url, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, query as Record<string, string | number | undefined>);
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>(url, { method: "DELETE" });
  }

  private async exchangeAccessTokenForJwt(scope?: string): Promise<string> {
    const url = `${this.baseUrl}/api/auth/access-tokens/jwt`;
    const body = JSON.stringify({
      access_token: this.accessToken,
      duration_seconds: JWT_DURATION_SECONDS,
      ...(scope ? { scope } : {}),
    });

    return this.exchangeJwt(url, { "Content-Type": "application/json" }, body, "JWT exchange");
  }

  private async exchangeSessionTokenForJwt(scope: string): Promise<string> {
    const url = `${this.baseUrl}/api/auth/session-tokens/jwt`;
    const body = JSON.stringify({
      duration_seconds: JWT_DURATION_SECONDS,
      scope,
    });

    return this.exchangeJwt(
      url,
      {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      "Scoped JWT exchange",
    );
  }

  private async exchangeJwt(
    url: string,
    headers: Record<string, string>,
    body: string,
    operation: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${operation} failed (HTTP ${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { jwt: string };
      return data.jwt;
    } catch (err) {
      clearTimeout(timeoutId);
      throw new Error(
        `Failed to exchange token for JWT: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private tokenHasScope(token: string, scope: string): boolean {
    const payload = this.decodeJwtPayload(token);
    if (!payload) return false;

    const scopeClaim = typeof payload.scope === "string" ? payload.scope : "";
    const scopes = scopeClaim.split(/\s+/).filter(Boolean);
    const expiresAt = this.jwtExpiresAtFromPayload(payload);

    return scopes.includes(scope) && (!expiresAt || Date.now() < expiresAt - JWT_REFRESH_MARGIN_MS);
  }

  private jwtExpiresAtFromToken(token: string): number | undefined {
    const payload = this.decodeJwtPayload(token);
    return payload ? this.jwtExpiresAtFromPayload(payload) : undefined;
  }

  private jwtExpiresAtFromPayload(payload: Record<string, unknown>): number | undefined {
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | undefined {
    try {
      const [, payload] = token.split(".");
      if (!payload) return undefined;
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private async request<T>(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const bearerToken = await this.getBearerToken();
      const response = await fetch(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: "application/json",
          ...init.headers,
        },
        body: init.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "60", 10);
        const error: ApiError = {
          code: "RATE_LIMITED",
          message: `Rate limited. Retry after ${retryAfter} seconds.`,
          status: 429,
          retryAfter,
        };
        return { data: undefined as T, status: 429, ok: false, error };
      }

      if (response.status === 204) {
        return { data: undefined as T, status: 204, ok: true };
      }

      const contentType = response.headers.get("content-type") ?? "";
      let data: T;
      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as T;
      }

      if (!response.ok) {
        const error = this.parseError(data, response.status);
        return { data, status: response.status, ok: false, error };
      }

      return { data, status: response.status, ok: true };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === "AbortError") {
        const error: ApiError = {
          code: "TIMEOUT",
          message: `Request timed out after ${this.timeout}ms`,
          status: 0,
        };
        return { data: undefined as T, status: 0, ok: false, error };
      }

      const error: ApiError = {
        code: "API_UNREACHABLE",
        message: err instanceof Error ? err.message : "Unknown error connecting to Witboost API",
        status: 0,
      };
      return { data: undefined as T, status: 0, ok: false, error };
    }
  }

  private parseError(body: unknown, status: number): ApiError {
    const codeMap: Record<number, string> = {
      400: "VALIDATION_ERROR",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      500: "INTERNAL_ERROR",
    };

    let message = `HTTP ${status}`;
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (b.error && typeof b.error === "object") {
        const e = b.error as Record<string, unknown>;
        message = typeof e.message === "string" ? e.message : JSON.stringify(e);
      } else if (typeof b.message === "string") {
        message = b.message;
      } else if (Array.isArray(b.errors) && b.errors.length > 0) {
        message = (b.errors as any[]).map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
      } else {
        // Dump the response body so the agent can diagnose the issue
        message = `HTTP ${status}: ${JSON.stringify(body).slice(0, 500)}`;
      }
    } else if (typeof body === "string") {
      message = body;
    }

    return {
      code: codeMap[status] ?? "UNKNOWN",
      message,
      status,
    };
  }
}
