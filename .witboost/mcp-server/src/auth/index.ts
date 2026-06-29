import { ssoLogin } from "./login.js";

async function main(): Promise<void> {
  const baseUrl = process.env.WITBOOST_BASE_URL;
  if (!baseUrl) {
    process.stderr.write(
      "[sso-login] Error: WITBOOST_BASE_URL is not set.\n" +
        "Set it in .witboost/config.yml or as an environment variable.\n",
    );
    process.exit(1);
  }

  try {
    const result = await ssoLogin(baseUrl);
    // Print token to stdout so it can be captured by callers
    process.stdout.write(result.token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[sso-login] Error: ${msg}\n`);
    process.exit(1);
  }
}

main();
