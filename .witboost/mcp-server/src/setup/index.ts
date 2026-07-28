import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../config/loader.js";
import type { AgentDefinition, GeneratedFile, HarnessGenerator, SkillDefinition } from "../generators/types.js";
import { CopilotGenerator } from "../generators/copilot.js";
import { ClaudeGenerator } from "../generators/claude.js";
import { CodexGenerator } from "../generators/codex.js";
import { DeepAgentsGenerator } from "../generators/deepagents.js";
import { GeminiGenerator } from "../generators/gemini.js";

// ── CLI Argument Parsing ────────────────────────────────────────────

interface CliOptions {
  harness?: string;
  dryRun: boolean;
  force: boolean;
  configPath?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, force: false, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--harness":
        opts.harness = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--config":
        opts.configPath = args[++i];
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Witboost AI Toolkit — Setup Script

Usage: node .witboost/mcp-server/setup.cjs [options]

Options:
  --harness <name>    Generate files for a specific harness (copilot, claude, codex, gemini, deepagents)
                      Can be specified multiple times. Default: from config.yml
  --dry-run           Show what files would be generated without writing them
  --force             Overwrite existing files without prompting
  --config <path>     Path to config file (default: .witboost/config.yml)
  --help, -h          Show this help

Exit codes:
  0  Success
  1  Configuration error
  2  Generation error
`);
}

// ── Skill Loader ────────────────────────────────────────────────────

function loadSkillDefinitions(skillsDir: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();
  if (!existsSync(skillsDir)) return skills;

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) {
      console.warn(`⚠ Skipping skill ${entry.name}: missing SKILL.md`);
      continue;
    }

    const raw = readFileSync(skillPath, "utf-8");
    const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`⚠ Skipping skill ${entry.name}: no YAML frontmatter`);
      continue;
    }

    const meta = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
    const content = frontmatterMatch[2].trim();

    skills.set(meta.name as string ?? entry.name, {
      name: (meta.name as string) ?? entry.name,
      description: (meta.description as string) ?? "",
      tools: (meta.tools as string[]) ?? [],
      content,
    });
  }

  return skills;
}

// ── Agent Loader ────────────────────────────────────────────────────

function loadAgentDefinitions(agentsDir: string, skillsDir: string): AgentDefinition[] {
  const allSkills = loadSkillDefinitions(skillsDir);
  const agents: AgentDefinition[] = [];
  const subdirs = ["core", "custom"];

  for (const sub of subdirs) {
    const dir = join(agentsDir, sub);
    if (!existsSync(dir)) continue;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const ymlPath = join(dir, entry.name, "agent.yml");
      const mdPath = join(dir, entry.name, "instructions.md");

      if (!existsSync(ymlPath)) {
        console.warn(`⚠ Skipping ${sub}/${entry.name}: missing agent.yml`);
        continue;
      }
      if (!existsSync(mdPath)) {
        console.warn(`⚠ Skipping ${sub}/${entry.name}: missing instructions.md`);
        continue;
      }

      const raw = parseYaml(readFileSync(ymlPath, "utf-8")) as Record<string, unknown>;
      const instructions = readFileSync(mdPath, "utf-8");

      const skillNames = (raw.skills as string[]) ?? [];
      const directTools = (raw.tools as string[]) ?? [];

      // Resolve skills → tools + collect skill definitions
      const resolvedSkills: SkillDefinition[] = [];
      const skillTools: string[] = [];
      for (const sn of skillNames) {
        const skill = allSkills.get(sn);
        if (skill) {
          resolvedSkills.push(skill);
          skillTools.push(...skill.tools);
        } else {
          console.warn(`⚠ Agent ${entry.name}: unknown skill "${sn}"`);
        }
      }

      // Merge: direct tools + skill-resolved tools (deduplicated)
      const allTools = [...new Set([...directTools, ...skillTools])];

      agents.push({
        name: raw.name as string,
        displayName: raw.displayName as string,
        description: raw.description as string,
        tools: allTools,
        skills: skillNames,
        resolvedSkills,
        category: (raw.category as string) ?? "lifecycle",
        instructions,
        variables: raw.variables as Record<string, string> | undefined,
        harness: raw.harness as AgentDefinition["harness"],
      });
    }
  }

  return agents;
}

// ── Generator Registry ──────────────────────────────────────────────

const GENERATORS: Record<string, () => HarnessGenerator> = {
  copilot: () => new CopilotGenerator(),
  claude: () => new ClaudeGenerator(),
  codex: () => new CodexGenerator(),
  gemini: () => new GeminiGenerator(),
  deepagents: () => new DeepAgentsGenerator(),
};

// ── Main ────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // Load config
  let config;
  try {
    config = loadConfig(opts.configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Configuration error: ${msg}`);
    process.exit(1);
  }

  // Determine output directory (repo root = cwd)
  const repoRoot = process.cwd();
  const witboostDir = join(repoRoot, ".witboost");
  const agentsDir = join(witboostDir, "agents");
  const skillsDir = join(witboostDir, "skills");

  // Load agent definitions
  const agents = loadAgentDefinitions(agentsDir, skillsDir);
  if (agents.length === 0) {
    console.error("✗ No agent definitions found in .witboost/agents/");
    process.exit(2);
  }
  console.log(`Found ${agents.length} agent(s): ${agents.map((a) => a.name).join(", ")}`);

  // Determine harness targets
  let targets: string[];
  if (opts.harness) {
    targets = [opts.harness];
  } else {
    // Read from config file if available
    const configPath = opts.configPath ?? join(witboostDir, "config.yml");
    let configTargets = ["copilot"];
    if (existsSync(configPath)) {
      const raw = parseYaml(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const harness = raw.harness as Record<string, unknown> | undefined;
      if (harness?.targets && Array.isArray(harness.targets)) {
        configTargets = harness.targets as string[];
      }
    }
    targets = configTargets;
  }

  // Generate files for each harness
  let totalFiles = 0;
  for (const target of targets) {
    const factory = GENERATORS[target];
    if (!factory) {
      console.warn(`⚠ Unknown harness: ${target} (available: ${Object.keys(GENERATORS).join(", ")})`);
      continue;
    }

    console.log(`\nGenerating ${target} files...`);
    const generator = factory();

    let files: GeneratedFile[];
    try {
      files = generator.generate(agents, config, repoRoot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Generation error (${target}): ${msg}`);
      process.exit(2);
    }

    for (const file of files) {
      const fullPath = resolve(repoRoot, file.path);

      if (opts.dryRun) {
        const exists = existsSync(fullPath);
        const action = exists ? (file.overwrite ? "overwrite" : "skip") : "create";
        console.log(`  [${action}] ${file.path}`);
        continue;
      }

      if (existsSync(fullPath) && !file.overwrite && !opts.force) {
        console.log(`  [skip] ${file.path} (exists, use --force to overwrite)`);
        continue;
      }

      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
      if (file.path.endsWith(".sh")) {
        chmodSync(fullPath, 0o755);
      }
      console.log(`  [write] ${file.path}`);
      totalFiles++;
    }
  }

  if (opts.dryRun) {
    console.log("\n(dry run — no files written)");
  } else {
    console.log(`\n✓ Generated ${totalFiles} file(s) for harness(es): ${targets.join(", ")}`);
  }
}

main();
