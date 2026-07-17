#!/usr/bin/env node
// improve-fast CLI — dependency-free client for the improve.fast REST API.
// Requires Node >= 18 (built-in fetch). No dependencies, no build step.

const DEFAULT_API_URL = 'https://improve.fast';

const HELP_TOPICS = new Set(['init', 'initialize', 'select', 'record', 'status', 'help']);

function usageLine() {
  return 'Usage: improve-fast <command> [args] [--json] [--api <url>]';
}

function topLevelHelp() {
  return `improve-fast — multi-armed bandit experimentation for AI agents

${usageLine()}

Commands:
  init <variant> <variant> [...]     Create a new experiment (alias: initialize)
  select <experimentId>              Get the recommended next variant to try
  record <experimentId> <variant> <score>
                                      Log a 0-1 outcome score for a variant
  status <experimentId>              Check progress, stats, and winner
  help [command]                     Show this help, or detail for one command

Flags:
  --json              Print raw JSON instead of human-readable text
  --api <url>         Override the API base URL (default: ${DEFAULT_API_URL})

Environment:
  IMPROVE_FAST_API_URL  Same effect as --api; --api takes precedence.

Workflow:
  1. improve-fast init "friendly tone" "formal tone"
       -> prints an experimentId. Save it.
  2. improve-fast select <experimentId>
       -> prints the variant to try next (e.g. "friendly tone").
  3. Do the task using that variant.
  4. improve-fast record <experimentId> "friendly tone" 0.8
       -> logs the outcome (0=worst, 1=best). Repeat from step 2.
  5. improve-fast status <experimentId>
       -> check "converged" / "winner" to know when to stop.

Run 'improve-fast help <command>' for details on a specific command.
Exit codes: 0 success, 1 usage/validation error, 2 API or network error.`;
}

function commandHelp(command) {
  switch (command) {
    case 'init':
    case 'initialize':
      return `improve-fast init <variant> <variant> [<variant> ...]

Create a new experiment comparing two or more variants.

Args:
  variant   Unique, case-sensitive identifier for each option being compared.
            At least 2 required.

Flags:
  --json    Print the raw JSON response.
  --api     Override the API base URL.

Examples:
  improve-fast init "friendly tone" "formal tone"
  improve-fast init --json variant-a variant-b variant-c

Output (human mode): the new experimentId, the variant list, and when the
experiment expires (experiments expire 7 days after creation).

Exit codes: 0 created, 1 fewer than 2 variants or duplicate variants, 2 API/network error.`;

    case 'select':
      return `improve-fast select <experimentId>

Ask which variant to try next. Read-only: does not affect experiment state.
Uses Thompson Sampling, so repeated calls on the same state may return
different variants by design — that randomness is what balances
exploration against exploitation.

Args:
  experimentId   UUID returned by 'init'.

Flags:
  --json    Print the raw JSON response.
  --api     Override the API base URL.

Examples:
  improve-fast select 3fa85f64-5717-4562-b3fc-2c963f66afa6

Output (human mode): just the variant name, plus a one-line hint to record
the outcome afterward. Designed to be easy to parse or feed directly into
the next step of an agent loop.

Exit codes: 0 success, 1 bad/missing experimentId, 2 API/network error (404 if experiment not found or expired).`;

    case 'record':
      return `improve-fast record <experimentId> <variant> <score>

Log the outcome of trying a variant. Updates the experiment's estimates.

Args:
  experimentId   UUID returned by 'init'.
  variant        Must match one of the variants passed to 'init' exactly.
  score          Number from 0 to 1, normalized so 1 is the best possible
                 outcome and 0 is the worst. Not clamped — out-of-range
                 values are rejected, not silently corrected.

Flags:
  --json    Print the raw JSON response.
  --api     Override the API base URL.

Examples:
  improve-fast record 3fa85f64-5717-4562-b3fc-2c963f66afa6 "friendly tone" 0.8
  improve-fast record --json 3fa85f64-... variant-a 1

Output (human mode): confirmation of the logged score, the "progress" pacing
metric (see below), and the winner if the experiment has just converged.
Note: convergence is a separate check from "progress" and can happen while
progress is still low — see reference/methodology.md.

Scoring guidance: pick one consistent rubric per experiment (e.g. "did the
task succeed" -> 1/0, or a quality rating scaled to [0,1]) and apply it the
same way across variants. Inconsistent scoring criteria between calls will
bias the result.

Exit codes: 0 recorded, 1 invalid variant/score/args, 2 API/network error.`;

    case 'status':
      return `improve-fast status <experimentId>

Check an experiment's progress without recording anything.

Args:
  experimentId   UUID returned by 'init'.

Flags:
  --json    Print the raw JSON response.
  --api     Override the API base URL.

Examples:
  improve-fast status 3fa85f64-5717-4562-b3fc-2c963f66afa6

Output (human mode): total evaluations so far, the "progress" pacing metric
(0-1, not a confidence measure), estimated evaluations remaining, per-variant
stats, and the winner if converged. Convergence is checked independently of
progress and can happen while progress is still low — see
reference/methodology.md for exactly what "converged" means.

Exit codes: 0 success, 1 bad/missing experimentId, 2 API/network error.`;

    case 'help':
      return `improve-fast help [command]

Show general help, or detailed usage for one command.

Examples:
  improve-fast help
  improve-fast help record`;

    default:
      return null;
  }
}

function printAndExit(stream, message, code) {
  stream.write(message.endsWith('\n') ? message : message + '\n');
  process.exit(code);
}

function fail(message, code = 1) {
  printAndExit(process.stderr, `Error: ${message}`, code);
}

function parseArgs(argv) {
  const flags = { json: false, api: null };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--api') {
      const value = argv[i + 1];
      if (value === undefined) {
        fail("--api requires a URL argument, e.g. --api https://staging.improve.fast");
      }
      flags.api = value;
      i++;
    } else if (arg.startsWith('--api=')) {
      flags.api = arg.slice('--api='.length);
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function resolveApiUrl(flags) {
  const raw = flags.api || process.env.IMPROVE_FAST_API_URL || DEFAULT_API_URL;
  return raw.replace(/\/+$/, '');
}

async function apiRequest(baseUrl, method, path, body) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    fail(`could not reach ${baseUrl} (${err.message})`, 2);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      fail(`unexpected non-JSON response from ${baseUrl}${path} (HTTP ${response.status})`, 2);
    }
  }

  if (!response.ok) {
    const err = data && data.error;
    const code = err && err.code ? err.code : `HTTP_${response.status}`;
    const message = err && err.message ? err.message : `request failed with HTTP ${response.status}`;
    fail(`${message} (${code})`, 2);
  }

  return data;
}

function formatWinner(winner) {
  if (!winner) return 'no winner yet';
  const parts = [`winner: ${winner.variantName}`];
  if (typeof winner.meanScore === 'number') parts.push(`meanScore=${winner.meanScore.toFixed(3)}`);
  if (typeof winner.evaluations === 'number') parts.push(`evaluations=${winner.evaluations}`);
  if (typeof winner.stdDev === 'number') parts.push(`stdDev=${winner.stdDev.toFixed(3)}`);
  if (Array.isArray(winner.confidenceInterval)) {
    const [lo, hi] = winner.confidenceInterval;
    parts.push(`95% CI=[${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
  }
  return parts.join(', ');
}

function formatPercent(fraction) {
  if (typeof fraction !== 'number') return 'n/a';
  return `${Math.round(fraction * 100)}%`;
}

function formatTimestamp(epochMs) {
  if (typeof epochMs !== 'number') return String(epochMs);
  return new Date(epochMs).toISOString();
}

async function cmdInit(args, flags, apiUrl) {
  if (args.length < 2) {
    fail('init requires at least 2 variants, e.g. improve-fast init "a" "b"');
  }
  const unique = new Set(args);
  if (unique.size !== args.length) {
    fail('variant names must be unique');
  }

  const data = await apiRequest(apiUrl, 'POST', '/api/experiments', { variants: args });

  if (flags.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  process.stdout.write(
    [
      `experimentId: ${data.experimentId}`,
      `variants: ${data.variants.join(', ')}`,
      `expiresAt: ${formatTimestamp(data.expiresAt)}`
    ].join('\n') + '\n'
  );
  process.stderr.write(`Next: improve-fast select ${data.experimentId}\n`);
}

async function cmdSelect(args, flags, apiUrl) {
  const [experimentId] = args;
  if (!experimentId) {
    fail('select requires an experimentId, e.g. improve-fast select <experimentId>');
  }

  const data = await apiRequest(apiUrl, 'POST', `/api/experiments/${experimentId}/select`, undefined);

  if (flags.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  // Only the variant name goes to stdout, so `$(improve-fast select <id>)` is
  // safe to capture and feed directly into `record`. Guidance goes to stderr.
  process.stdout.write(`${data.variant}\n`);
  process.stderr.write(
    `(after using this variant: improve-fast record ${experimentId} "${data.variant}" <score>)\n`
  );
}

async function cmdRecord(args, flags, apiUrl) {
  const [experimentId, variant, scoreRaw] = args;
  if (!experimentId || variant === undefined || scoreRaw === undefined) {
    fail('record requires: <experimentId> <variant> <score>');
  }

  const score = Number(scoreRaw);
  if (Number.isNaN(score) || score < 0 || score > 1) {
    fail(`score must be a number between 0 and 1, got "${scoreRaw}"`);
  }

  const data = await apiRequest(apiUrl, 'POST', `/api/experiments/${experimentId}/record`, {
    variant,
    score
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  const lines = [
    `recorded: ${data.variant} = ${data.score}`,
    `totalEvaluations: ${data.totalEvaluations}`,
    `progress: ${formatPercent(data.progress)}`
  ];
  if (data.winner) {
    lines.push(`Converged. ${formatWinner(data.winner)}`);
  } else {
    lines.push(`estimatedRemainingEvaluations: ${data.estimatedRemainingEvaluations}`);
  }
  process.stdout.write(lines.join('\n') + '\n');

  if (!data.winner) {
    process.stderr.write(`Next: improve-fast select ${experimentId}\n`);
  }
}

async function cmdStatus(args, flags, apiUrl) {
  const [experimentId] = args;
  if (!experimentId) {
    fail('status requires an experimentId, e.g. improve-fast status <experimentId>');
  }

  const data = await apiRequest(apiUrl, 'GET', `/api/experiments/${experimentId}`, undefined);

  if (flags.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  const lines = [
    `experimentId: ${data.experimentId}`,
    `totalEvaluations: ${data.totalEvaluations}`,
    `progress: ${formatPercent(data.progress)}`,
    `converged: ${data.converged}`
  ];
  if (!data.converged) {
    lines.push(`estimatedRemainingEvaluations: ${data.estimatedRemainingEvaluations}`);
  }
  if (Array.isArray(data.variants)) {
    lines.push('', 'variants:');
    for (const v of data.variants) {
      lines.push(`  ${JSON.stringify(v)}`);
    }
  }
  if (data.winner) {
    lines.push('', formatWinner(data.winner));
  }
  process.stdout.write(lines.join('\n') + '\n');

  if (!data.winner) {
    process.stderr.write(`Next: improve-fast select ${experimentId}\n`);
  }
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const { flags, positional } = parseArgs(rawArgv);
  const [command, ...args] = positional;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    const topic = command === 'help' ? args[0] : rawArgv.find((a) => HELP_TOPICS.has(a));
    if (topic && topic !== 'help') {
      const detail = commandHelp(topic === 'initialize' ? 'init' : topic);
      if (!detail) {
        fail(`no help available for "${topic}"`);
      }
      process.stdout.write(detail + '\n');
    } else {
      process.stdout.write(topLevelHelp() + '\n');
    }
    process.exit(0);
  }

  const apiUrl = resolveApiUrl(flags);

  switch (command) {
    case 'init':
    case 'initialize':
      await cmdInit(args, flags, apiUrl);
      break;
    case 'select':
      await cmdSelect(args, flags, apiUrl);
      break;
    case 'record':
      await cmdRecord(args, flags, apiUrl);
      break;
    case 'status':
      await cmdStatus(args, flags, apiUrl);
      break;
    default:
      fail(`unknown command "${command}". Run 'improve-fast help' for usage.`);
  }
}

main().catch((err) => {
  fail(err && err.message ? err.message : String(err), 2);
});
