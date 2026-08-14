# hanto-agent-team

A small team of Claude Code subagents with strictly separated responsibilities:
**planner → designer → developer → tester → reviewer**.

Each agent has one job, a limited toolset, and a fixed handoff document. No agent
re-decides what a previous agent already decided — scope stays in `spec-*.md`, design
decisions stay in `design-*.md`, and code review never edits code.

## Pipeline

```
planner    -> batched clarifying questions -> docs/spec-<slug>.md  [HUMAN APPROVAL]
designer   -> docs/design-<slug>.md (layout, states, tokens)        [HUMAN APPROVAL]
developer  -> step plan -> [impact review -> code -> brief -> confirm] per step  [HUMAN APPROVAL x N]
tester     -> docs/test-report-<slug>.md (PASS/FAIL)                [HUMAN CHOICE on FAIL]
reviewer   -> findings (blocker/warn/nit), read-only                [HUMAN APPROVAL to merge]
```

`<slug>` is a kebab-case name for the feature/task, shared across all docs for that unit
of work (e.g. `spec-login-form.md`, `design-login-form.md`, ...).

## Human-in-the-loop gates

No agent hands off silently. Every stage stops and uses `AskUserQuestion` before its output
is treated as final:

- **planner**: presents a 5-8 bullet summary, waits for confirmation before writing spec.md.
- **designer**: summarizes key design decisions, waits for approval before developer starts.
- **developer**: gates after *every* implementation step, not just at the end.
- **tester**: on FAIL, asks the user to choose — send back to developer, adjust the spec, or
  accept as a known limitation. Doesn't auto-loop.
- **reviewer**: the final checkpoint. Blocker findings ask "fix now or accept the risk?";
  a clean report still asks for explicit merge approval — a clean report is not itself a
  green light.

If `tester` reports FAIL or `reviewer` reports a `blocker`, the loop hands back to
`developer` with the report attached (per the user's choice) — it does not restart from
planner unless the root cause turns out to be a spec/design gap.

## Install

From inside any project:

```bash
npx github:pointmina/hanto-agent-team install
```

This copies the 5 agent files into `./.claude/agents/`. Claude Code picks them up as
subagents automatically — no npm publish, no global install needed.

Alternative (manual copy):

```bash
git clone https://github.com/pointmina/hanto-agent-team.git
cp hanto-agent-team/.claude/agents/*.md /path/to/your/project/.claude/agents/
```

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
| planner   | Read, Grep, Glob, WebSearch, WebFetch, Write, AskUserQuestion | edit/write code |
| designer  | Read, Write, WebFetch, Grep, Glob, AskUserQuestion | edit/write implementation code |
| developer | Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion | advance to the next step without confirmation |
| tester    | Read, Bash, Edit, Grep, Glob, AskUserQuestion | edit production code (test files only, by convention) |
| reviewer  | Read, Grep, Bash, Glob, AskUserQuestion | edit anything, or declare "done" without asking |

## Model guidance

All 5 agents do professional judgment work (spec interrogation, design tradeoffs, real
implementation, bug verification, code review) — none of it is brainstorming/spell-check/
formatting-tier work. Every agent is set to `model: sonnet` in its frontmatter by default;
override per-call if a task genuinely needs Opus (e.g. a gnarly architecture or security
call) or, for something outside this pipeline entirely, a lighter model. Don't drop any of
these agents to a lightweight model expecting the same judgment quality.

## Step-by-step confirmation (developer)

`developer` doesn't implement a whole feature in one shot. It posts a numbered step plan
first, then for each step: impact review (if touching existing code) → minimal code for
that step only → a short brief → `AskUserQuestion` to gate before the next step. Confirmed
steps are referred back to only as a compact done-list, not re-explained.

## License

MIT
