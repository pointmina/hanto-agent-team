#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const cmd = process.argv[2];

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

if (cmd === "install") {
  install();
} else {
  console.log("Usage: hanto-agent-team install");
  process.exit(cmd ? 1 : 0);
}
