---
name: improve-fast
description: Run multi-armed bandit experiments (Thompson Sampling over a Bayesian model) to find the best-performing variant of something — a prompt phrasing, a tool description, a system message, a piece of copy — through repeated try/score cycles against the improve.fast API. Use when the user wants to A/B test or optimize among 2+ variants and can score each attempt, wants a variant chosen adaptively rather than via fixed random split, or asks to "run an experiment" / "find the best version" / "which one performs better".
---

# improve-fast

Finds the best of 2+ variants by repeatedly asking which one to try, doing the task, and reporting
back how well it went. improve.fast (Thompson Sampling + Bayesian updates) shifts future picks
toward whatever's winning as evidence comes in, and tells you when it's confident enough to stop.

Use the bundled CLI at `bin/improve-fast` (POSIX sh wrapper; `bin/improve-fast.mjs` is a
dependency-free Node >= 18 script). Run `improve-fast help` for full usage, or
`improve-fast help <command>` for one command's detail. If the CLI isn't usable in your
environment, call the REST API directly — see `reference/api.md`.

## Workflow

1. **Initialize** with the variants to compare (at least 2, unique names):
   ```
   improve-fast init "friendly tone" "formal tone"
   ```
   Save the printed `experimentId` — every later call needs it.

2. **Select** the variant to try next:
   ```
   improve-fast select <experimentId>
   ```
   Human-mode stdout is the variant name and nothing else (a usage hint is printed to stderr, not
   stdout), so `VARIANT=$(improve-fast select <experimentId>)` captures a clean value. This is
   read-only and can return a different variant each call even with no new data — that's
   intentional (see `reference/methodology.md`). When scripting or capturing output
   programmatically, prefer `--json` and read the `.variant` field instead of relying on stdout
   formatting, e.g. `improve-fast select <experimentId> --json`.

3. **Do the task** using that variant (e.g. actually use that prompt phrasing to produce output).

4. **Record** how well it went, as a score from 0 (worst) to 1 (best):
   ```
   improve-fast record <experimentId> "friendly tone" 0.8
   ```
   Pick one scoring rubric per experiment and apply it consistently across variants — see the
   scoring guidance below. As with `select`, add `--json` if you need to parse the response
   programmatically rather than scrape human-readable text.

5. **Repeat steps 2–4.** After each `record`, check the response (or run `status`) for
   `converged: true` / a non-null `winner`. Stop looping once converged; report the winner. If
   progress stalls, `estimatedRemainingEvaluations` gives a rough sense of how much further to go.

Check progress anytime without recording:
```
improve-fast status <experimentId>
```

## Scoring guidance

Scores must land in `[0, 1]`; out-of-range values are rejected, not clamped. Use whatever rubric
fits the task, but keep it identical across every `record` call in the experiment:

- Binary success: `1` if the task succeeded, `0` if it didn't.
- Quality rating: scale a 1–5 or 1–10 rating linearly onto `[0, 1]`.
- Composite: combine multiple signals (correctness, latency, user reaction) into one number, as
  long as the same formula is used for every variant.

Inconsistent rubrics between calls bias the result — the "winner" ends up reflecting scoring drift
rather than genuine variant quality.

## Interpreting output

- `converged` / `winner`: the authoritative stop signal. Once `converged: true` (equivalently,
  `winner` is non-null), the experiment has enough evidence — stop looping and report the winner.
- `progress` (0–1): a pacing metric toward a fallback evaluation cap, **not** a measure of confidence
  in the winner. It is normal for `converged: true` to appear while `progress` is still low — a
  clear winner is usually found statistically long before the cap. Don't treat low `progress` as
  "not close to done"; always check `converged` / `winner` directly instead.
- `estimatedRemainingEvaluations`: a rough, non-binding estimate, not a guarantee.
- `winner`, when present, is an object keyed `variantName` (not `name`), plus `evaluations`,
  `meanScore`, `stdDev`, and a `confidenceInterval` tuple.

For the statistics behind these fields (Thompson Sampling, Bayesian posteriors, what "converged"
formally means), see `reference/methodology.md`.

## Reference

- `reference/cli.md` — full command and flag reference, with example output.
- `reference/api.md` — raw REST endpoints, for calling the API directly (e.g. via `curl`) when the
  CLI isn't available.
- `reference/methodology.md` — how Thompson Sampling and the Bayesian model work, and why selection
  is stochastic.
