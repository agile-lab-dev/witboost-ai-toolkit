// scripts/copy-assets.js
// Copies config assets into .witboost/ after tsup build
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, ".witboost");

function copyFile(src, dest) {
  mkdirSync(dirname(resolve(dist, dest)), { recursive: true });
  copyFileSync(resolve(root, src), resolve(dist, dest));
}

// Config defaults → config.yml
copyFile("config/defaults.yml", "config.yml");

// .gitignore for .witboost/
copyFile("config/dot-gitignore", ".gitignore");

// MCP server package.json
copyFile("config/mcp-server-package.json", "mcp-server/package.json");

console.log("✓ Config assets copied to .witboost/");
