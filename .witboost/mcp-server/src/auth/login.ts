import http from "node:http";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const LOCAL_PORT = 19876;
const REDIRECT_URI = `http://localhost:${LOCAL_PORT}/callback`;
const LOGIN_TIMEOUT_MS = 120_000;

export interface TokenData {
  token: string;
  expiresAt: number;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

interface OidcClientRegistration {
  client_id: string;
  client_secret?: string;
}

interface OidcTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
}

function tokenFilePath(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), ".witboost", "token.json");
}

/** Load a cached token if it exists and is still valid (with 60s margin) */
export function loadCachedToken(cwd?: string): TokenData | null {
  const file = tokenFilePath(cwd);
  if (!existsSync(file)) return null;
  try {
    const data: TokenData = JSON.parse(readFileSync(file, "utf-8"));
    if (data.token && data.expiresAt > Date.now() + 60_000) return data;
    return null;
  } catch {
    return null;
  }
}

/** Save token to .witboost/token.json */
function saveToken(data: TokenData, cwd?: string): void {
  const file = tokenFilePath(cwd);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

/** Register an OIDC client with Witboost */
async function registerClient(baseUrl: string): Promise<OidcClientRegistration> {
  const res = await fetch(`${baseUrl}/api/auth/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "witboost-ai-toolkit",
      redirect_uris: [REDIRECT_URI],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(`OIDC client registration failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as OidcClientRegistration;
}

/** PKCE helpers */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Open URL in the default browser */
function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${url}"`, { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    }
  } catch {
    process.stderr.write(`[sso-login] Open this URL in your browser:\n${url}\n`);
  }
}

/** Wait for the OAuth callback on a local HTTP server */
function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${LOCAL_PORT}`);

      if (url.pathname === "/callback") {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          const desc = url.searchParams.get("error_description") ?? error;
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h2>Login failed</h2><p>${desc}</p></body></html>`);
          server.close();
          reject(new Error(`SSO login failed: ${desc}`));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Invalid state</h2></body></html>");
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h2>No authorization code received</h2></body></html>");
          server.close();
          reject(new Error("No authorization code in callback"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body style=\"font-family:system-ui;text-align:center;padding:60px\">" +
            "<h1>&#10004; Login successful</h1>" +
            "<p>You can close this tab and return to VS Code.</p>" +
            "</body></html>",
        );
        server.close();
        resolve(code);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(LOCAL_PORT, () => {
      process.stderr.write(`[sso-login] Waiting for SSO callback on port ${LOCAL_PORT}...\n`);
    });

    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(new Error(`Port ${LOCAL_PORT} is already in use. Close other login processes and retry.`));
      } else {
        reject(err);
      }
    });

    setTimeout(() => {
      server.close();
      reject(new Error("SSO login timed out after 2 minutes. Please try again."));
    }, LOGIN_TIMEOUT_MS);
  });
}

/** Exchange authorization code for tokens */
async function exchangeCode(
  baseUrl: string,
  clientId: string,
  code: string,
  codeVerifier: string,
): Promise<OidcTokenResponse> {
  const res = await fetch(`${baseUrl}/api/auth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as OidcTokenResponse;
}

/** Refresh an expired token using a refresh_token */
async function refreshToken(
  baseUrl: string,
  clientId: string,
  refreshTok: string,
): Promise<OidcTokenResponse | null> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshTok,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as OidcTokenResponse;
  } catch {
    return null;
  }
}

/**
 * Full SSO login flow:
 * 1. Check for cached valid token
 * 2. Try refresh if expired but refresh_token exists
 * 3. Otherwise start interactive browser login
 */
export async function ssoLogin(rawBaseUrl: string, cwd?: string): Promise<TokenData> {
  // Normalize: strip trailing slashes
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");

  // 1. Check cache
  const cached = loadCachedToken(cwd);
  if (cached) {
    process.stderr.write("[sso-login] Using cached token (valid).\n");
    return cached;
  }

  // 2. Try refresh
  const tokenFile = tokenFilePath(cwd);
  if (existsSync(tokenFile)) {
    try {
      const old: TokenData = JSON.parse(readFileSync(tokenFile, "utf-8"));
      if (old.refreshToken && old.clientId) {
        process.stderr.write("[sso-login] Token expired, attempting refresh...\n");
        const refreshed = await refreshToken(baseUrl, old.clientId, old.refreshToken);
        if (refreshed) {
          const data: TokenData = {
            token: refreshed.access_token ?? refreshed.id_token ?? "",
            expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
            refreshToken: refreshed.refresh_token ?? old.refreshToken,
            clientId: old.clientId,
            clientSecret: old.clientSecret,
          };
          if (data.token) {
            saveToken(data, cwd);
            process.stderr.write("[sso-login] Token refreshed successfully.\n");
            return data;
          }
        }
        process.stderr.write("[sso-login] Refresh failed, starting interactive login...\n");
      }
    } catch {
      // corrupted file, proceed with fresh login
    }
  }

  // 3. Interactive login
  process.stderr.write("[sso-login] Registering OIDC client...\n");
  const client = await registerClient(baseUrl);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL(`${baseUrl}/api/auth/v1/authorize`);
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  process.stderr.write("[sso-login] Opening browser for Microsoft SSO...\n");
  openBrowser(authUrl.toString());

  const code = await waitForCallback(state);

  process.stderr.write("[sso-login] Exchanging authorization code for token...\n");
  const tokenResponse = await exchangeCode(baseUrl, client.client_id, code, codeVerifier);

  const token = tokenResponse.access_token ?? tokenResponse.id_token ?? "";
  if (!token) {
    throw new Error("No token received from Witboost auth.");
  }

  const data: TokenData = {
    token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
    refreshToken: tokenResponse.refresh_token,
    clientId: client.client_id,
    clientSecret: client.client_secret,
  };

  saveToken(data, cwd);
  process.stderr.write("[sso-login] Login successful! Token saved.\n");
  return data;
}
