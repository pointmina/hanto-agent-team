# hanto-agent-team

A small team of Claude Code subagents with strictly separated responsibilities:
**planner → designer → developer → tester → reviewer**.

Each agent has one job, a limited toolset, and a fixed handoff document. No agent
re-decides what a previous agent already decided — scope stays in `spec-*.md`, design
decisions stay in `design-*.md`, and code review never edits code.

## Pipeline

```
planner    -> docs/spec-<slug>.md         (what & why, non-goals, success criteria)
designer   -> docs/design-<slug>.md       (layout, states, tokens)
developer  -> docs/impl-<slug>.md + code  (implementation, minimal, matches spec+design)
tester     -> docs/test-report-<slug>.md  (PASS/FAIL against spec's success criteria)
reviewer   -> findings (blocker/warn/nit), read-only
```

`<slug>` is a kebab-case name for the feature/task, shared across all docs for that unit
of work (e.g. `spec-login-form.md`, `design-login-form.md`, ...).

If `tester` reports FAIL or `reviewer` reports a `blocker`, the loop hands back to
`developer` with the report attached — it does not restart from planner unless the root
cause turns out to be a spec/design gap.

## Install

Copy `.claude/agents/*.md` into your project's `.claude/agents/` directory:

```bash
git clone https://github.com/pointmina/hanto-agent-team.git
cp hanto-agent-team/.claude/agents/*.md /path/to/your/project/.claude/agents/
```

Claude Code will pick them up as subagents automatically.

## Usage

Invoke each stage with the Task/Agent tool using the agent's name, passing the slug and
prior handoff docs as context. Typical flow in one session:

```
"Use planner to spec out <feature>"
"Use designer to design <slug> from the spec"
"Use developer to implement <slug>"
"Use tester to verify <slug>"
"Use reviewer to review <slug>"
```

## Why separate agents instead of one

Each agent's tool grant enforces its boundary instead of relying on a prompt to "please
don't do X":

| Agent     | Tools                                  | Can't do                        |
|-----------|-----------------------------------------|----------------------------------|
| planner   | Read, Grep, Glob, WebSearch, WebFetch, Write | edit/write code               |
| designer  | Read, Write, WebFetch, Grep, Glob       | edit/write implementation code  |
| developer | Read, Edit, Write, Bash, Grep, Glob     | (full — implements)             |
| tester    | Read, Bash, Edit, Grep, Glob            | edit production code (test files only, by convention) |
| reviewer  | Read, Grep, Bash, Glob                  | edit anything                   |

## License

MIT
