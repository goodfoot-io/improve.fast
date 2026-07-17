# Methodology

improve.fast picks variants with **Thompson Sampling** over a **Bayesian Gaussian** model of each
variant's score. This is what makes it useful mid-task: unlike a fixed A/B split, it shifts traffic
toward whichever variant is looking better as evidence comes in, without needing a human to eyeball
a dashboard and cut the experiment over manually.

## The model

Each variant's outcomes are treated as draws from a distribution with an unknown mean. The service
keeps a posterior belief about that mean — starting wide (little evidence) and narrowing as scores
for that variant accumulate (`posteriorMean`, `posteriorStdDev` in the status response). This is
distinct from `meanScore`, the plain empirical average — early on, with few observations, the
posterior stays close to a neutral prior even if the empirical mean is noisy from a couple of
observations.

## Selection: Thompson Sampling

On each `select` call, the service draws one random sample from each variant's current posterior and
returns the variant with the highest sample. Variants with a higher posterior mean get picked more
often; variants with high uncertainty (wide posterior — not yet well-tested) also get picked more
often, because a wide distribution occasionally samples high even if its mean is middling. This is
why:

- Selection is **stochastic by design** — repeated calls without new data can return different
  variants.
- A variant that's underperforming but under-tested still gets picked sometimes (exploration), while
  a clear frontrunner gets picked increasingly often (exploitation) — automatically, without manual
  traffic-split tuning.

## Convergence

`progress` and `converged` are **independent** signals — don't read one as a proxy for the other.

`progress` is a pacing metric: `min(evaluations across all variants) / 50`, capped at 1. It tracks
how far the *least*-tested variant is toward a fallback evaluation cap, not confidence in a winner.
It's useful for a rough sense of how much budget an experiment could consume in the worst case, and
nothing more.

`converged` (equivalently, a non-null `winner`) is decided by a separate check, true when **either**
of these holds:

- **Evaluation cap**: total evaluations across all variants reaches `50 × number of variants`. (This
  is the case `progress` paces toward — a fallback so an experiment can't run forever even with a
  genuinely ambiguous result.)
- **Statistical separation**: the leading variant has at least 15 evaluations, its posterior standard
  deviation is below 0.05, and it beats the runner-up by both more than 0.1 absolute (posterior mean)
  and more than 2× the two variants' combined standard deviation.

In practice, a clear winner is usually found via statistical separation long before the evaluation
cap — so it's normal and expected to see `converged: true` while `progress` is still low (e.g. 15
evaluations on a 2-variant experiment converges at `progress = 15/50 = 0.3`, well under 1). Treat
`converged` / `winner` as the authoritative stop signal; don't wait for `progress` to approach 1.

`estimatedRemainingEvaluations` is a rough, non-binding estimate of how many more `record` calls are
likely needed before convergence, useful for budgeting how long to keep looping.

## What this means for scoring

Because the model is fit per variant across whatever scores it receives, **consistency matters more
than precision**: use the same rubric for every score within one experiment (e.g. always "did the
task succeed" as 1/0, or always a quality rating scaled to `[0, 1]`). Switching rubrics mid-experiment,
or scoring one variant more leniently than another, biases the posterior and produces a winner that
reflects the scoring drift rather than real variant quality.
