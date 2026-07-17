# CLI reference

Bundled at `bin/improve-fast` (POSIX sh wrapper around `bin/improve-fast.mjs`, Node >= 18, no
dependencies). Every command supports `--json` for raw API output and `--api <url>` to point at a
non-default deployment; `--api` can also be set via `IMPROVE_FAST_API_URL`.

Exit codes are consistent across commands: `0` success, `1` usage or validation error (bad args,
out-of-range score, duplicate variants), `2` API or network error (unreachable host, 404, 400 from
the server).

**Stream discipline (human mode):** stdout carries only the command's primary data — safe to
capture with `$(...)` or pipe. Any "Next: ..." usage hint goes to **stderr**, so it never pollutes
captured output; redirect with `2>/dev/null` if you want stdout alone in a terminal too. Errors also
go to stderr. With `--json`, stdout is exactly the raw API response and nothing else — prefer
`--json` over scraping human-mode text whenever a script or agent needs to parse the result.

Full detail for any command: `improve-fast help <command>`.

## init (alias: initialize)

```
improve-fast init <variant> <variant> [<variant> ...]
```

Creates a new experiment. Requires at least 2 unique, case-sensitive variant names. Prints the new
`experimentId`, the variant list, and `expiresAt` (experiments expire 7 days after creation).

```
$ improve-fast init "friendly tone" "formal tone"
experimentId: 3fa85f64-5717-4562-b3fc-2c963f66afa6
variants: friendly tone, formal tone
expiresAt: 2026-07-24T21:31:38.851Z
```
(stdout above; a `Next: improve-fast select ...` hint is printed separately to stderr.)

(The API returns `createdAt`/`expiresAt` as epoch milliseconds; human-mode output formats them as
ISO 8601 for readability. `--json` returns the raw epoch-ms values — see `api.md`.)

## select

```
improve-fast select <experimentId>
```

Read-only. Returns the variant to try next. **stdout is exactly the variant name and nothing
else** — safe to capture directly, e.g. `VARIANT=$(improve-fast select <experimentId>)`. A
"record this next" hint line is printed to stderr, not stdout, so it never ends up in captured
output. Repeated calls on unchanged state may return different variants — Thompson Sampling is
stochastic by design (see `methodology.md`). For scripts/agents, `--json` + reading `.variant` is
even more robust than relying on stdout formatting.

```
$ improve-fast select 3fa85f64-... 2>/dev/null
friendly tone
```

## record

```
improve-fast record <experimentId> <variant> <score>
```

Logs one outcome. `variant` must exactly match a name passed to `init`. `score` is a number in
`[0, 1]` (1 = best possible outcome, 0 = worst); out-of-range values are rejected, not clamped. On
success, stdout is the logged value, running total, and the `progress` pacing metric — followed by
either `estimatedRemainingEvaluations` or (if this call pushed the experiment past the convergence
threshold) the winner line. A "Next: improve-fast select ..." hint, when present, goes to stderr,
not stdout. Convergence is checked independently of `progress` and commonly happens while
`progress` is still low — see `methodology.md`.

```
$ improve-fast record 3fa85f64-... "formal tone" 0.8
recorded: formal tone = 0.8
totalEvaluations: 29
progress: 28%
Converged. winner: formal tone, meanScore=0.819, evaluations=15, stdDev=0.050, 95% CI=[0.794, 0.844]
```

## status

```
improve-fast status <experimentId>
```

Read-only. stdout is total evaluations, the `progress` pacing metric (0–1, not a confidence
measure), an estimate of evaluations remaining (when not yet converged), per-variant stats, and the
winner once `converged` is true. A "Next: improve-fast select ..." hint (only printed when not yet
converged) goes to stderr, not stdout. `converged` can flip to true well before `progress` nears 1
— see `methodology.md` for why.

## help

```
improve-fast help [command]
```

No-arg form prints an overview and the workflow loop. With a command name, prints that command's
full usage, args, examples, and exit codes.
