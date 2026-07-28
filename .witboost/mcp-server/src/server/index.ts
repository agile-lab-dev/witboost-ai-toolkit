import { loadConfig, loadDotEnv } from "../config/loader.js";
import { createServer } from "./server.js";
import { startTransport } from "./transport.js";
import { ssoLogin, loadCachedToken } from "../auth/login.js";

// Import tool registration modules (side-effect: registers tools)
import "../tools/blueprints.js";
import "../tools/data-products.js";
import "../tools/domains.js";
import "../tools/components.js";
import "../tools/repositories.js";
import "../tools/provisioning.js";
import "../tools/testing.js";
import "../tools/governance.js";
import "../tools/marketplace.js";

async function main(): Promise<void> {
  try {
    // Load .env early so auth vars are available before loadConfig()
    loadDotEnv();

    const authMethod = (process.env.WITBOOST_AUTH_METHOD ?? "pat").toLowerCase();
    const baseUrl = process.env.WITBOOST_BASE_URL;

    if (authMethod === "sso") {
      // SSO mode: full login flow (cache → refresh → interactive browser)
      if (!baseUrl) {
        process.stderr.write(
          "[witboost-ai-toolkit] WITBOOST_AUTH_METHOD=sso requires WITBOOST_BASE_URL.\n",
        );
        process.exit(1);
      }
      const result = await ssoLogin(baseUrl);
      process.env.WITBOOST_TOKEN = result.token;
    } else {
      // PAT mode (default): use WITBOOST_TOKEN, fallback to cached SSO token
      let token = process.env.WITBOOST_TOKEN;
      if (!token && baseUrl) {
        const cached = loadCachedToken();
        if (cached) {
          token = cached.token;
          process.stderr.write("[witboost-ai-toolkit] Using cached SSO token.\n");
        }
      }
      if (token) {
        process.env.WITBOOST_TOKEN = token;
      }
    }

    const config = loadConfig();
    const server = createServer(config);
    await startTransport(server);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[witboost-ai-toolkit] Failed to start: ${message}\n`);
    process.exit(1);
  }
}

main();
