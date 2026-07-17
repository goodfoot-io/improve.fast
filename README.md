# improve.fast

A multi-armed bandit experimentation service for AI agents. Define two or more variants of
something — a prompt phrasing, a tool description, a piece of copy — then iteratively ask which
variant to try (Thompson Sampling), do the task, score the result from 0 to 1, and repeat. The
service adapts which variant it recommends as evidence comes in (Bayesian Gaussian posterior
updates) and reports a converged winner once it's confident enough to stop.

## Install

```
npx skills add goodfoot-io/improve.fast
```

This installs the `improve-fast` skill, including a dependency-free CLI (`improve-fast`, Node >= 18)
that talks to the improve.fast REST API.

## Quick usage

```
$ improve-fast init "friendly tone" "formal tone"
experimentId: 3fa85f64-5717-4562-b3fc-2c963f66afa6
variants: friendly tone, formal tone
expiresAt: 2026-07-24T21:32:49.549Z

$ improve-fast select 3fa85f64-5717-4562-b3fc-2c963f66afa6
friendly tone

# ... do the task using "friendly tone", then score it 0-1 ...

$ improve-fast record 3fa85f64-5717-4562-b3fc-2c963f66afa6 "friendly tone" 0.8
recorded: friendly tone = 0.8
totalEvaluations: 1
progress: 0%
estimatedRemainingEvaluations: 99

Next: improve-fast select 3fa85f64-5717-4562-b3fc-2c963f66afa6
```

Keep looping `select` -> do the task -> `record` until the response shows `converged: true` / a
non-null `winner` — note this is a statistical check independent of `progress`, so it can happen
while `progress` is still low.

Full instructions, scoring guidance, and API reference: see
[`skills/improve-fast/SKILL.md`](skills/improve-fast/SKILL.md) and the docs under
[`skills/improve-fast/reference/`](skills/improve-fast/reference/).

Live API: https://improve.fast
