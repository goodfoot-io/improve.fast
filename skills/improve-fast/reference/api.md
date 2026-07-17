# REST API reference

Base URL: `https://improve.fast`. No authentication — the `experimentId` UUID returned by
`POST /api/experiments` is the sole credential for all subsequent calls on that experiment. Treat it
like a secret: anyone with the ID can select and record against the experiment.

Use this directly (e.g. with `curl`) if the bundled CLI isn't available in your environment; the CLI
is a thin wrapper over these same endpoints.

All error responses share this shape, with HTTP status 400 (validation), 404 (unknown or expired
experiment), or 405 (wrong method):

```json
{ "error": { "code": "STRING_CODE", "message": "human-readable description" } }
```

## Create an experiment

```
POST /api/experiments
Content-Type: application/json

{ "variants": ["a", "b"] }
```

Requires at least 2 variant names, unique within the array. Returns `201`:

```json
{
  "experimentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "variants": ["a", "b"],
  "createdAt": 1784323867366,
  "expiresAt": 1784928667366
}
```

`createdAt` and `expiresAt` are Unix epoch milliseconds, not ISO strings. Experiments expire 7 days
after creation; calls against an expired ID return `404`. (The CLI's human-mode output formats these
as ISO 8601 for readability; `--json` returns the raw epoch-ms values.)

## Get status

```
GET /api/experiments/:id
```

Read-only, no body. Returns:

```json
{
  "experimentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "totalEvaluations": 42,
  "progress": 0.6,
  "estimatedRemainingEvaluations": 12,
  "converged": false,
  "variants": [ /* per-variant stats */ ],
  "winner": null
}
```

`progress` is a pacing metric, not a confidence measure — see `methodology.md` for what it actually
tracks and how it relates (or doesn't) to `converged`.

`winner` is `null` until convergence, then an object shaped like:

```json
{
  "variantName": "formal tone",
  "evaluations": 15,
  "meanScore": 0.819,
  "stdDev": 0.050,
  "confidenceInterval": [0.794, 0.844]
}
```

`confidenceInterval` is a `[lower, upper]` tuple. Note the field is `variantName`, not `name`.

## Select next variant

```
POST /api/experiments/:id/select
```

Read-only aside from being a `POST` (no state mutation, no body required). Returns:

```json
{ "experimentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "variant": "a" }
```

Selection uses Thompson Sampling and is intentionally stochastic — repeated calls against unchanged
state can return different variants.

## Record an outcome

```
POST /api/experiments/:id/record
Content-Type: application/json

{ "variant": "a", "score": 0.8 }
```

`variant` must match one of the experiment's variant names exactly. `score` must be a number in
`[0, 1]`; values outside that range are rejected with `400`, not clamped. Returns:

```json
{
  "experimentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "variant": "a",
  "score": 0.8,
  "totalEvaluations": 43,
  "progress": 0.65,
  "estimatedRemainingEvaluations": 9,
  "winner": null
}
```

`winner` flips from `null` to the winning-variant object (same shape as in `GET
/api/experiments/:id`, keyed `variantName`) on the call that pushes the experiment past the
convergence threshold — see `methodology.md` for the exact condition. This can happen well before
`progress` reaches 1.
