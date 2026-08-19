#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const USAGE = `Usage:
  hanto install                     Copy the 5 agents into ./.claude/agents/
  hanto run <slug> [description...] Start the full pipeline (planner -> ... -> reviewer)
  hanto find-skills <query...>      Look for a public skill for this task
  hanto mcp <description...>        Build an MCP server for this service/API
  hanto quick <task...>             Run the input as-is, no pipeline/skill steering
  hanto config                      Open the browser settings UI
  hanto help                        Show this message

Options (run / find-skills / mcp / quick):
  --headless      Run this one time as "claude -p" (non-interactive)
  --interactive   Run this one time as an interactive "claude" session
`;

function printUsageAndExit(message) {
  if (message) console.error(message + "\n");
  console.error(USAGE);
  process.exit(1);
}

// Splits --headless / --interactive out of the args, leaving the rest as
// positional args (slug/description/query/etc). Errors on conflicting flags.
function parseExecutionFlag(args) {
  let execution = null;
  const rest = [];
  for (const arg of args) {
    if (arg === "--headless" || arg === "--interactive") {
      const flagValue = arg === "--headless" ? "headless" : "interactive";
      if (execution && execution !== flagValue) {
        printUsageAndExit("--headless and --interactive can't be used together.");
      }
      execution = flagValue;
    } else {
      rest.push(arg);
    }
  }
  return { execution, rest };
}

function install() {
  const srcDir = path.join(__dirname, "..", ".claude", "agents");
  const destDir = path.join(process.cwd(), ".claude", "agents");

  fs.mkdirSync(destDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    console.log(`  + ${file}`);
  }

  console.log(`\n${files.length} agent(s) installed to .claude/agents/`);
  console.log("planner -> designer -> developer -> tester -> reviewer");
}

// Placeholder used by modes not wired up yet in this step of the build.
// Later steps replace this with the real claude spawn logic.
function notImplementedYet(mode, { execution, input }) {
  console.log(`[hanto] ${mode}: parsed ok (execution=${execution}, input=${JSON.stringify(input)})`);
  console.log("[hanto] execution logic lands in a later build step.");
}

function runCommand(args) {
  const { execution, rest } = parseExecutionFlag(args);
  const slug = rest[0];
  if (!slug) {
    printUsageAndExit("hanto run needs a <slug>.\n  Example: hanto run login-form \"login screen with email/password\"");
  }
  if (!SLUG_RE.test(slug)) {
    printUsageAndExit(
      `Invalid slug: "${slug}". Slugs must be lowercase kebab-case (e.g. "login-form").`
    );
  }
  const description = rest.slice(1).join(" ");
  notImplementedYet("run", { execution: execution || "interactive", input: { slug, description } });
}

function findSkillsCommand(args) {
  const { execution, rest } = parseExecutionFlag(args);
  const query = rest.join(" ");
  if (!query) {
    printUsageAndExit("hanto find-skills needs a query.\n  Example: hanto find-skills \"browser automation for tests\"");
  }
  notImplementedYet("find-skills", { execution: execution || "interactive", input: query });
}

function mcpCommand(args) {
  const { execution, rest } = parseExecutionFlag(args);
  const description = rest.join(" ");
  if (!description) {
    printUsageAndExit("hanto mcp needs a description.\n  Example: hanto mcp \"connect to the Notion API\"");
  }
  notImplementedYet("mcp", { execution: execution || "interactive", input: description });
}

function quickCommand(args) {
  const { execution, rest } = parseExecutionFlag(args);
  const task = rest.join(" ");
  if (!task) {
    printUsageAndExit("hanto quick needs a task.\n  Example: hanto quick \"rename foo() to bar() across the repo\"");
  }
  notImplementedYet("quick", { execution: execution || "interactive", input: task });
}

function configCommand() {
  console.log("[hanto] config UI lands in a later build step.");
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "install":
      install();
      break;
    case "run":
      runCommand(rest);
      break;
    case "find-skills":
      findSkillsCommand(rest);
      break;
    case "mcp":
      mcpCommand(rest);
      break;
    case "quick":
      quickCommand(rest);
      break;
    case "config":
      configCommand();
      break;
    case "help":
    case "-h":
    case "--help":
    case undefined:
      console.log(USAGE);
      process.exit(cmd ? 0 : 1);
      break;
    default:
      printUsageAndExit(`Unknown command: "${cmd}"`);
  }
}

main();
