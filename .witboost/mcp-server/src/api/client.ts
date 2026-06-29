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

    // Exchange PAT for JWT
    const url = `${this.baseUrl}/api/auth/access-tokens/jwt`;
    const body = JSON.stringify({
      access_token: this.accessToken,
      duration_seconds: JWT_DURATION_SECONDS,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`JWT exchange failed (HTTP ${response.status}): ${text}`);
      }

      const data = (await response.json()) as { jwt: string };
      this.jwt = data.jwt;
      this.jwtExpiresAt = Date.now() + JWT_DURATION_SECONDS * 1000;
      return this.jwt;
    } catch (err) {
      clearTimeout(timeoutId);
      throw new Error(
        `Failed to exchange PAT for JWT: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
