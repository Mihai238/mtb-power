# mtb-power

## Tickets

Tickets are GitHub issues on `Mihai238/mtb-power`, referred to by number (e.g. "work on #3"). Use `gh`.

- Check the open issues when asked what's left or what to work on.
- When a ticket is finished, ask whether to close its issue.

## Learnings

Keep learnings and preferences in this file (machine-specific ones in `CLAUDE.local.md`), not in Claude's global memory.

- Never add a `Co-Authored-By: Claude` trailer (or any Claude attribution) to commit messages.
- Build only what was asked. Offer extras as a suggestion in the reply; don't add options, features or docs unprompted (a road-bike selector, a pause toggle and a README note were all removed again).
- Claude runs inside herdr. To open an interactive tool such as `tuicr` "in this tab": `herdr pane split --current --direction right --cwd "$PWD"`, then `herdr pane run <pane> "<cmd>"` and `herdr pane zoom <pane> --on`. Run `herdr --skill` first for the full guide.
- tuicr review comments: `tuicr review list`, `tuicr review comments --session <slug>`; reply with `tuicr review add --session <slug> --target-file <file> --line <n> --username "<model name>" "<text>"`. Don't add comments while that session is open in tuicr.
