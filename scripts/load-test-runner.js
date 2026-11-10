#!/usr/bin/env node

const { performance } = require('node:perf_hooks');

const DEFAULT_RATIOS = '1:0,20:1,10:1,5:1,3:1,1:1,0:1';

function parseArgs(argv) {
  const args = {
    mode: 'rw',
    baseUrl: process.env.API_URL ?? '',
    key: process.env.LOAD_TEST_KEY ?? '',
    duration: 60,
    connections: 50,
    ratios: DEFAULT_RATIOS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--mode') args.mode = next;
    else if (arg === '--base-url') args.baseUrl = next;
    else if (arg === '--key') args.key = next;
    else if (arg === '--duration') args.duration = Number(next);
    else if (arg === '--connections') args.connections = Number(next);
    else if (arg === '--ratios') args.ratios = next;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      continue;
    }
    i += 1;
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '');
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/load-test-runner.js --mode rw --base-url http://alb --key KEY

Read/write options:
  --duration 60
  --connections 50
  --ratios 1:0,20:1,10:1,5:1,3:1,1:1,0:1
`);
}

function assertConfig(args) {
  if (!args.baseUrl) {
    throw new Error('Missing --base-url or API_URL.');
  }
  if (!args.key) {
    throw new Error('Missing --key or LOAD_TEST_KEY.');
  }
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((value / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(result) {
  const sorted = [...result.latencies].sort((a, b) => a - b);
  const seconds = result.durationMs / 1000;
  const total = result.latencies.length;
  const ok = Object.entries(result.statuses)
    .filter(([status]) => Number(status) >= 200 && Number(status) < 300)
    .reduce((sum, [, count]) => sum + count, 0);
  const errors = total - ok;
  return {
    total,
    ok,
    errors,
    reqPerSec: total / seconds,
    reqPerMin: (total / seconds) * 60,
    reqPerDay: (total / seconds) * 86400,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    statuses: result.statuses,
  };
}

function printSummary(label, summary) {
  console.log(`\n${label}`);
  console.log('='.repeat(label.length));
  console.log(`total=${summary.total}`);
  console.log(`ok=${summary.ok}`);
  console.log(`errors=${summary.errors}`);
  console.log(`req/s=${summary.reqPerSec.toFixed(2)}`);
  console.log(`req/min=${summary.reqPerMin.toFixed(0)}`);
  console.log(`req/day=${summary.reqPerDay.toFixed(0)}`);
  console.log(`p50=${summary.p50.toFixed(1)}ms`);
  console.log(`p95=${summary.p95.toFixed(1)}ms`);
  console.log(`p99=${summary.p99.toFixed(1)}ms`);
  console.log(`max=${summary.max.toFixed(1)}ms`);
  console.log(`statuses=${JSON.stringify(summary.statuses)}`);
}

async function timedRequest(url, options) {
  const startedAt = performance.now();
  let status = 0;
  try {
    const response = await fetch(url, options);
    status = response.status;
    await response.arrayBuffer();
  } catch {
    status = 0;
  }
  return { status, latencyMs: performance.now() - startedAt };
}

function requestForRatio(baseUrl, reads, writes) {
  if (writes === 0) {
    return { url: `${baseUrl}/api/load-test/db`, method: 'GET' };
  }
  if (reads === 0) {
    return { url: `${baseUrl}/api/load-test/db-write`, method: 'POST' };
  }
  return {
    url: `${baseUrl}/api/load-test/db-mixed?reads=${reads}&writes=${writes}`,
    method: 'POST',
  };
}

async function runForDuration(args, label, request) {
  const deadline = performance.now() + args.duration * 1000;
  const result = { latencies: [], statuses: {}, durationMs: 0 };
  const headers = {
    'x-load-test-key': args.key,
    'user-agent': 'nutriscan-load-test',
  };

  const worker = async () => {
    while (performance.now() < deadline) {
      const sample = await timedRequest(request.url, { method: request.method, headers });
      result.latencies.push(sample.latencyMs);
      result.statuses[sample.status] = (result.statuses[sample.status] ?? 0) + 1;
    }
  };

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: args.connections }, () => worker()));
  result.durationMs = performance.now() - startedAt;
  printSummary(label, summarize(result));
}

async function postJson(url, args) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-load-test-key': args.key,
      'user-agent': 'nutriscan-load-test',
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function cleanupDb(args) {
  const result = await postJson(`${args.baseUrl}/api/load-test/db-cleanup`, args);
  if (result.status >= 400) {
    console.log(`db cleanup failed: status=${result.status}`);
  }
}

async function runReadWriteMatrix(args) {
  const ratios = args.ratios.split(',').map((entry) => {
    const [reads, writes] = entry.split(':').map(Number);
    if (!Number.isInteger(reads) || !Number.isInteger(writes) || reads < 0 || writes < 0) {
      throw new Error(`Invalid ratio: ${entry}`);
    }
    return { reads, writes };
  });

  for (const ratio of ratios) {
    await cleanupDb(args);
    const request = requestForRatio(args.baseUrl, ratio.reads, ratio.writes);
    await runForDuration(args, `read:write ${ratio.reads}:${ratio.writes}`, request);
  }

  await cleanupDb(args);
}

async function main() {
  const args = parseArgs(process.argv);
  assertConfig(args);

  if (args.mode === 'rw') {
    await runReadWriteMatrix(args);
    return;
  }

  throw new Error(`Unknown mode: ${args.mode}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
