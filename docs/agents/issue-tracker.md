# Issue tracker: Forgejo (local)

Issues and specs for this repo live on the local Forgejo instance at
`http://localhost:3080/nathan/sortie`. Use the `tea` CLI for all operations — anonymous HTTP
access is disabled, so `curl` against the API or page URLs is a dead end. `tea` is already
authenticated as login `local`.

If a `forgejo` skill is available in the session, load it — it carries the full recipe list
(attachments, dead ends, API quirks). The essentials are below.

## Conventions

Always pass `--login local --repo nathan/sortie`. `tea` works from any directory.

- **Create an issue**: `tea issues create --login local --repo nathan/sortie --title "..." --description "..."`. The body flag is `--description`/`-d` — there is **no** `--body`. For multi-line bodies, write a file first and pass `-d "$(cat file.md)"`.
- **Read an issue**: `tea issues <N> --login local --repo nathan/sortie`. Comments come from the API, not a subcommand: `tea api --login local "repos/nathan/sortie/issues/<N>/comments"`.
- **List issues**: `tea issues ls --login local --repo nathan/sortie --state all --limit 40`. Default state is `open`, so pass `--state all` when hunting for something closed.
- **Comment on an issue**: `tea comments add <N> --login local --repo nathan/sortie -d "..."` (the verb is `comments add`, not `comment`).
- **Apply / remove labels**: `tea issues edit <N> --login local --repo nathan/sortie --add-labels "..."` / `--remove-labels "..."` (comma-separated). Create missing repo labels with `tea labels create`.
- **Close**: `tea issues close <N> --login local --repo nathan/sortie`. Comment first if a closing rationale is needed — close takes no comment flag.
- **Anything else**: raw API via `tea api --login local "repos/nathan/sortie/..."`, paths relative to `/api/v1`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `tea pulls` equivalents (`tea pulls <N>`, `tea pulls ls`, `tea comments add`).

Forgejo shares one number space across issues and PRs, so a bare `#42` may be either — `tea issues <N>` and `tea pulls <N>` both resolve it.

## When a skill says "publish to the issue tracker"

Create a Forgejo issue with `tea issues create`.

## When a skill says "fetch the relevant ticket"

Run `tea issues <N> --login local --repo nathan/sortie`, then `tea api --login local "repos/nathan/sortie/issues/<N>/comments"` for the discussion.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: Forgejo has no sub-issues — add the child to a task list (`- [ ] #<n>`) in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Forgejo supports issue dependencies via the API — inspect with `tea api --login local "repos/nathan/sortie/issues/<child>/dependencies"`. If writing an edge through the API misbehaves, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`tea issues ls --state open` filtered to the map's task list), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `tea issues edit <n> --login local --repo nathan/sortie --add-assignees local` — the session's first write.
- **Resolve**: `tea comments add <n> ... -d "<answer>"`, then `tea issues close <n>`, then append a context pointer to the map's Decisions-so-far.
