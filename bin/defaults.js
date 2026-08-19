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

function isValidExecutionValue(value) {
  return value == null || VALID_EXECUTIONS.has(value);
}

function isValidPromptValue(value) {
  return value == null || typeof value === "string";
}

function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

// A field that's simply absent from `entry` falls back to `base` (patch
// semantics); a field explicitly sent as null/invalid resets to null
// (falls back to the built-in default at resolve time). This distinction
// matters: the settings UI always sends every field explicitly (including
// null for "follow the default"), so it must be able to clear a field, not
// just leave old values in place.
function normalizeModeEntry(entry, base) {
  const execution = hasOwn(entry, "execution")
    ? (isValidExecutionValue(entry.execution) ? entry.execution : null)
    : base.execution;

  const prompt = hasOwn(entry, "prompt")
    ? (typeof entry.prompt === "string" && entry.prompt.trim() !== "" ? entry.prompt : null)
    : base.prompt;

  return { execution: execution || null, prompt: prompt || null };
}

// Merges `override` onto `base` (a full config object, e.g. from
// defaultConfig() or a previously loaded/saved config) using patch
// semantics: a key missing from `override` keeps the value from `base`.
function mergeConfig(base, override) {
  const baseConfig = base && typeof base === "object" ? base : defaultConfig();
  const baseModes = baseConfig.modes || emptyModes();

  const merged = {
    version: CONFIG_VERSION,
    defaultExecution: hasOwn(override, "defaultExecution")
      ? (isValidExecutionValue(override.defaultExecution) && override.defaultExecution
          ? override.defaultExecution
          : "interactive")
      : baseConfig.defaultExecution || "interactive",
    modes: {},
  };

  const overrideModes = (override && override.modes) || {};
  for (const mode of MODES) {
    const baseEntry = baseModes[mode] || { execution: null, prompt: null };
    merged.modes[mode] = normalizeModeEntry(overrideModes[mode], baseEntry);
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

  const leftover = prompt.match(/\{[a-zA-Z0-9_]+\}/g);
  if (leftover) {
    console.error(
      `[hanto] Warning: this "${mode}" prompt still contains unresolved placeholder(s): ${leftover.join(", ")}`
    );
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
  isValidExecutionValue,
  isValidPromptValue,
  resolveExecution,
  resolvePrompt,
  saveConfig,
};
