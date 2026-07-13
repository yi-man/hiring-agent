# Global Codex AGENTS Design

## Goal

Replace the empty `~/.codex/AGENTS.md` with durable, cross-project coding guidance based on `/Users/xxwade/.cursor/rules/global-coding.mdc`.

## Scope

- Preserve the source rule's communication, deliberate decision-making, simplicity, scoped edits, and verification principles.
- Keep the guidance technology-neutral so each repository retains ownership of its stack, commands, and test strategy.
- Add a clear precedence rule: current user instructions, then repository `AGENTS.md`, then this global file.

## Adaptations

- Omit Cursor's YAML frontmatter because it does not apply to `AGENTS.md`.
- Change the tool preference rule to prefer the most suitable available tool; the terminal remains an appropriate Codex tool.
- Retain the rest of the source rules in concise Chinese, without weakening their behavioral requirements.

## Non-goals

- Do not copy Hiring Agent's Bun, Next.js, database, or test conventions into the global file.
- Do not create or change a `CLAUDE.md` symlink; this is personal Codex guidance, not a project configuration document.
- Do not alter Codex model, sandbox, plugin, hook, or authentication settings.

## Validation

1. Confirm `~/.codex/AGENTS.md` contains the approved sections and precedence rule.
2. Confirm the source Cursor rule remains unchanged.
3. Confirm no project files other than this design record are modified.
