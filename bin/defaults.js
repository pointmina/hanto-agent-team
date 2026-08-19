const fs = require("fs");
const path = require("path");

const CONFIG_VERSION = 1;
const VALID_EXECUTIONS = new Set(["interactive", "headless"]);
const MODES = ["run", "find-skills", "mcp", "quick"];

// Built-in prompt templates. {slug} is only meaningful for "run";
// {input} is available in all of them.
const BUILTIN_PROMPTS = {
  run:
    "Start with the planner subagent for slug \"{slug}\": {input}\n\n" +
    "Once docs/spec-{slug}.md is approved, continue the pipeline in order " +
    "(designer -> developer -> tester -> reviewer). Keep every human approval " +
    "gate defined in each agent - do not skip or auto-approve any of them.",
  "find-skills":
    "Use the find-skills skill to look for a public Claude Code skill that " +
    "fits this need: {input}",
  mcp:
    "Use the mcp-builder skill to build an MCP server for: {input}",
  quick: "{input}",
};

function configPath(cwd) {
  return path.join(cwd, ".claude", "hanto.config.json");
}

function emptyModes() {
  const modes = {};
  for (const mode of MODES) {
    modes[mode] = { execution: null, prompt: null };
  }
  return modes;
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    defaultExecution: "interactive",
    modes: emptyModes(),
  };
}

// Loads .claude/hanto.config.json, merged over built-in defaults. Never
// throws: a missing file falls back silently, a malformed file falls back
// with a warning on stderr.
function loadConfig(cwd) {
  const file = configPath(cwd);
  const base = defaultConfig();

  if (!fs.existsSync(file)) {
    return base;
  }

  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    console.error(`[hanto] Could not read ${file} (${err.code || err.message}). Using defaults.`);
    return base;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[hanto] ${file} is not valid JSON. Using defaults.`);
    return base;
  }

  return mergeConfig(base, parsed);
}

function mergeConfig(base, override) {
  const merged = defaultConfig();

  if (override && VALID_EXECUTIONS.has(override.defaultExecution)) {
    merged.defaultExecution = override.defaultExecution;
  }

  const overrideModes = (override && override.modes) || {};
  for (const mode of MODES) {
    const src = overrideModes[mode] || {};
    const dest = merged.modes[mode];

    if (VALID_EXECUTIONS.has(src.execution)) {
      dest.execution = src.execution;
    }
    if (typeof src.prompt === "string" && src.prompt.trim() !== "") {
      dest.prompt = src.prompt;
    }
  }

  return merged;
}

// Resolution order: CLI flag > mode's own execution setting > global
// defaultExecution > built-in "interactive".
function resolveExecution(config, mode, flagExecution) {
  if (flagExecution) return flagExecution;
  const modeExecution = config.modes[mode] && config.modes[mode].execution;
  if (modeExecution) return modeExecution;
  if (config.defaultExecution) return config.defaultExecution;
  return "interactive";
}

// Resolves the prompt template for a mode (user override or built-in),
// then substitutes {slug}/{input}.
function resolvePrompt(config, mode, vars) {
  const override = config.modes[mode] && config.modes[mode].prompt;
  const template = override || BUILTIN_PROMPTS[mode];

  let prompt = template;
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.split(`{${key}}`).join(value == null ? "" : String(value));
  }
  return prompt;
}

function saveConfig(cwd, config) {
  const file = configPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const tmpFile = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2) + "\n", "utf8");
  fs.renameSync(tmpFile, file);
}

module.exports = {
  CONFIG_VERSION,
  VALID_EXECUTIONS,
  MODES,
  BUILTIN_PROMPTS,
  configPath,
  defaultConfig,
  loadConfig,
  mergeConfig,
  resolveExecution,
  resolvePrompt,
  saveConfig,
};
