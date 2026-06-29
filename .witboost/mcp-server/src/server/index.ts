import { loadConfig } from "../config/loader.js";
import { createServer } from "./server.js";
import { startTransport } from "./transport.js";
import { ssoLogin, loadCachedToken } from "../auth/login.js";

// Import tool registration modules (side-effect: registers tools)
import "../tools/blueprints.js";
import "../tools/data-products.js";
import "../tools/components.js";
import "../tools/repositories.js";
import "../tools/provisioning.js";
import "../tools/testing.js";
import "../tools/governance.js";
import "../tools/marketplace.js";

async function main(): Promise<void> {
  try {
    // Try SSO token if no static token is configured
    let token = process.env.WITBOOST_TOKEN;
    const baseUrl = process.env.WITBOOST_BASE_URL;

    if (!token && baseUrl) {
      const cached = loadCachedToken();
      if (cached) {
        token = cached.token;
        process.stderr.write("[witboost-ai-toolkit] Using cached SSO token.\n");
      } else {
        process.stderr.write("[witboost-ai-toolkit] No token found. Run: node .witboost/login.cjs\n");
      }
    }

    if (token) {
      process.env.WITBOOST_TOKEN = token;
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
