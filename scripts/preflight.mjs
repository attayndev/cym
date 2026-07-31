#!/usr/bin/env node
/**
 * Release preflight. Must pass before any `eas build` or `eas update`.
 *
 * This exists because of a specific failure on July 29, 2026: an OTA was
 * published to the `production` channel without first establishing which
 * channel installed devices actually poll. Every real tester was on `preview`,
 * so the update reached nobody — and the resulting divergence was then
 * misdiagnosed as pre-existing drift. Both mistakes were one CLI call away
 * from being caught.
 *
 * So the rule this file enforces is: anything that cannot be VERIFIED is a
 * FAILURE, never a warning. A check that couldn't run is a check that didn't
 * pass. Measure twice, cut once.
 *
 *   node scripts/preflight.mjs [--channel production] [--environment production]
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const CHANNEL = flag('channel', 'production');
const ENVIRONMENT = flag('environment', 'production');

// Changes here are baked into the binary at build time — an OTA cannot
// deliver them, so a rebuild is required.
const NATIVE_PATHS = [
  'package.json',
  'package-lock.json',
  'app.json',
  'app.config.js',
  'google-services.json',
  'GoogleService-Info.plist',
  'ios/',
  'android/',
];
// Affects how FUTURE builds are made, not what current devices run.
const RELEASE_CONFIG_PATHS = ['eas.json'];

/**
 * Vars the app reads ONLY under `__DEV__`, which must never reach a shipped
 * bundle. These are excluded from the "must exist" parity check and asserted
 * ABSENT instead — the first draft of this script recommended creating
 * EXPO_PUBLIC_ANTHROPIC_API_KEY in production, which would have shipped a live
 * API key to users (drafts.ts gates it behind __DEV__ precisely to stop that).
 */
const DEV_ONLY_VARS = new Set(['EXPO_PUBLIC_ANTHROPIC_API_KEY']);

const results = [];
let failed = false;
/** Channels that actually have finished builds — i.e. channels real devices
 *  poll. A channel with no builds is not a risk; EAS creates it on first use. */
const channelsWithBuilds = new Set();

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  if (!ok) failed = true;
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${label}`);
  if (detail) for (const line of String(detail).split('\n')) console.log(`      ${line}`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

/** EAS CLI calls are the whole point of this script — if one fails we must
 *  stop, not shrug. Returns null and the caller records a hard failure. */
function eas(argv) {
  try {
    return execFileSync('npx', ['eas', ...argv], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function easJson(argv) {
  const raw = eas([...argv, '--json', '--non-interactive']);
  if (raw === null) return null;
  try {
    // The CLI prefixes upgrade notices on stderr, but stdout can still carry
    // a leading banner line; slice from the first JSON delimiter.
    const start = raw.search(/[[{]/);
    return start === -1 ? null : JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

console.log(`\nPREFLIGHT  channel=${CHANNEL}  environment=${ENVIRONMENT}\n`);

// ---------------------------------------------------------------- repo state
console.log('Repository');
let branch = '';
try {
  branch = sh('git rev-parse --abbrev-ref HEAD');
  const dirty = sh('git status --porcelain');
  record(!dirty, `working tree clean (branch ${branch})`, dirty || null);
} catch (e) {
  record(false, 'git state readable', e.message);
}

const head = (() => {
  try {
    return sh('git rev-parse HEAD');
  } catch {
    return null;
  }
})();

// ------------------------------------------------------------------- quality
console.log('\nQuality gates');
for (const [label, cmd] of [
  ['typecheck', 'npx tsc --noEmit'],
  ['tests', 'npx jest --silent --ci'],
]) {
  try {
    sh(cmd);
    record(true, label);
  } catch (e) {
    record(false, label, (e.stdout || e.stderr || e.message).toString().split('\n').slice(-15).join('\n'));
  }
}

// Repo-wide lint has known pre-existing failures, so gate on what THIS release
// changes: everything differing from the upstream branch, else the last commit.
try {
  let base = '';
  try {
    sh(`git rev-parse --verify origin/${branch}`);
    base = `origin/${branch}`;
  } catch {
    base = 'HEAD~1';
  }
  const changed = sh(`git diff --name-only ${base}...HEAD`)
    .split('\n')
    .concat(sh('git diff --name-only HEAD').split('\n'))
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !f.startsWith('supabase/functions/'));
  const unique = [...new Set(changed)].filter(Boolean);
  if (unique.length === 0) {
    record(true, `lint (changed vs ${base}) — no files to lint`);
  } else {
    sh(`npx eslint ${unique.map((f) => JSON.stringify(f)).join(' ')}`);
    record(true, `lint (${unique.length} changed file(s) vs ${base})`);
  }
} catch (e) {
  record(false, 'lint (changed)', (e.stdout || e.message).toString().split('\n').slice(0, 15).join('\n'));
}

// ----------------------------------------------------------- release surface
console.log('\nRelease surface');

const builds = easJson(['build:list', '--limit', '30']);
if (!builds) {
  record(false, 'read builds from EAS', 'eas build:list failed — cannot verify what devices are running.');
} else {
  const finished = builds.filter((b) => b.status === 'FINISHED');
  const byChannel = new Map();
  for (const b of finished) {
    if (!b.channel) continue;
    if (!byChannel.has(b.channel)) byChannel.set(b.channel, []);
    byChannel.get(b.channel).push(b);
    channelsWithBuilds.add(b.channel);
  }

  // The check that was skipped on July 29: where do real devices actually live?
  const lines = [...byChannel.entries()].map(([ch, list]) => {
    const dates = list.map((b) => (b.completedAt || '').slice(0, 10)).filter(Boolean).sort();
    const rtvs = [...new Set(list.map((b) => b.runtimeVersion))].join(', ');
    return `${ch.padEnd(12)} ${String(list.length).padStart(2)} build(s)  rtv ${rtvs}  ${dates[0]}..${dates[dates.length - 1]}`;
  });
  record(byChannel.size > 0, 'builds by channel (where devices actually are)', lines.join('\n'));

  const target = byChannel.get(CHANNEL) ?? [];
  record(
    target.length > 0,
    `channel "${CHANNEL}" has at least one finished build`,
    target.length === 0 ? `No FINISHED build on "${CHANNEL}". Publishing here reaches no device.` : null,
  );

  // runtimeVersion gate: an OTA only reaches builds whose rtv matches.
  try {
    const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
    const version = appJson.expo.version;
    const policy = appJson.expo.runtimeVersion?.policy;
    const reachable = target.filter((b) => b.runtimeVersion === version);
    record(
      reachable.length > 0,
      `runtimeVersion ${version} (policy ${policy}) matches ${reachable.length}/${target.length} build(s) on "${CHANNEL}"`,
      reachable.length === 0
        ? `No build on "${CHANNEL}" runs rtv ${version} — an OTA cannot reach them. A new build is required.`
        : null,
    );
  } catch (e) {
    record(false, 'read app.json version', e.message);
  }

  // Native surface vs the newest build on this channel: can an OTA carry this?
  const newest = target
    .slice()
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
  if (newest?.gitCommitHash && head) {
    try {
      sh(`git cat-file -e ${newest.gitCommitHash}^{commit}`);
      // Note the single-ref form: this diffs the build's commit against the
      // WORKING TREE, not against HEAD. Comparing commit-to-commit would make
      // uncommitted native changes invisible to this check.
      const diff = sh(`git diff --name-only ${newest.gitCommitHash}`).split('\n').filter(Boolean);
      let native = diff.filter((f) => NATIVE_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));

      // package.json carries npm scripts as well as dependencies, and only the
      // dependency blocks can change what's in the binary. Compare those
      // directly so a scripts-only edit doesn't demand a pointless rebuild —
      // a gate that cries wolf stops being read.
      if (native.includes('package.json') || native.includes('package-lock.json')) {
        const depsOf = (j) => JSON.stringify({ d: j.dependencies ?? {}, dd: j.devDependencies ?? {} });
        const atBuild = depsOf(JSON.parse(sh(`git show ${newest.gitCommitHash}:package.json`)));
        // Read from disk, not `git show HEAD:` — same reason as above.
        const now = depsOf(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
        if (atBuild === now) {
          native = native.filter((f) => f !== 'package.json' && f !== 'package-lock.json');
          console.log('      note: package.json changed but dependencies are identical — not a rebuild trigger');
        }
      }
      const cfg = diff.filter((f) => RELEASE_CONFIG_PATHS.includes(f));
      record(
        native.length === 0,
        `native surface unchanged since build ${newest.gitCommitHash.slice(0, 7)} (OTA is sufficient)`,
        native.length ? `REBUILD REQUIRED — these are baked into the binary:\n${native.join('\n')}` : null,
      );
      if (cfg.length) {
        console.log(`      note: ${cfg.join(', ')} changed — affects FUTURE builds only, not current devices`);
      }
    } catch {
      record(false, 'compare native surface to last build', `commit ${newest.gitCommitHash} not found locally — fetch it before releasing.`);
    }
  } else {
    record(false, 'locate last build commit', 'No gitCommitHash on the newest build for this channel.');
  }
}

// ------------------------------------------------------ channel→branch map
const channels = easJson(['channel:list']);
const branches = easJson(['branch:list']);
let targetBranchId = null;
let knownChannels = null;
if (!channels || !branches) {
  record(false, 'read channel/branch mapping', 'eas channel:list or branch:list failed.');
} else {
  const chList = channels.currentPage ?? channels;
  const brList = branches.currentPage ?? branches;
  knownChannels = new Set(chList.map((c) => c.name));
  const nameById = new Map(brList.map((b) => [b.id, b.name]));
  const map = chList.map((ch) => {
    let id = null;
    try {
      id = JSON.parse(ch.branchMapping || '{}')?.data?.[0]?.branchId ?? null;
    } catch {
      id = null;
    }
    if (ch.name === CHANNEL) targetBranchId = id;
    return { channel: ch.name, branchId: id, branch: nameById.get(id) ?? '(unmapped)' };
  });
  record(
    map.some((m) => m.channel === CHANNEL),
    'channel → branch map',
    map.map((m) => `${m.channel.padEnd(12)} → ${m.branch}`).join('\n'),
  );

  // Channels sharing the target's branch follow along; the rest do not.
  const followers = map.filter((m) => m.channel !== CHANNEL && m.branchId && m.branchId === targetBranchId);
  const stranded = map.filter((m) => m.channel !== CHANNEL && m.branchId !== targetBranchId);
  if (followers.length) {
    console.log(`      follows this publish: ${followers.map((m) => m.channel).join(', ')}`);
  }
  if (stranded.length) {
    console.log(`      does NOT follow: ${stranded.map((m) => m.channel).join(', ')} — devices there keep their current bundle`);
  }
}

// -------------------------------------------------------- build config sanity
console.log('\nBuild config coherence');
try {
  const easCfg = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

  // A profile wired for store submission cannot use internal distribution —
  // internal produces ad-hoc/APK artifacts that TestFlight and Play reject.
  // This is here because collapsing two profiles on July 29 briefly put
  // `distribution: internal` on `beta`, which has ASC keys for TestFlight.
  const submitProfiles = Object.keys(easCfg.submit ?? {});
  const mismatched = submitProfiles.filter((n) => easCfg.build?.[n]?.distribution === 'internal');
  record(
    mismatched.length === 0,
    'store-submitted profiles use store distribution',
    mismatched.length
      ? `These have a submit config but distribution "internal", which cannot be submitted:\n${mismatched.join('\n')}`
      : `checked: ${submitProfiles.join(', ') || 'none'}`,
  );

  // A channel with real builds on it MUST exist and be mapped to a branch, or
  // the devices running those builds silently receive nothing. A channel with
  // no builds yet is fine — EAS creates it on first build.
  if (knownChannels) {
    const stranding = [...channelsWithBuilds].filter((c) => !knownChannels.has(c));
    record(
      stranding.length === 0,
      'every channel with real builds exists on EAS',
      stranding.length
        ? `Devices on these channels can never receive an update:\n${stranding.join('\n')}`
        : `checked: ${[...channelsWithBuilds].join(', ') || 'none'}`,
    );

    const notYetCreated = Object.entries(easCfg.build ?? {})
      .filter(([, p]) => p.channel && !knownChannels.has(p.channel) && !channelsWithBuilds.has(p.channel))
      .map(([n, p]) => `${n} → "${p.channel}"`);
    if (notYetCreated.length) {
      console.log(`      note: no builds yet on ${notYetCreated.join(', ')} — EAS creates the channel on first build`);
    }
  } else {
    record(false, 'verify channels for existing builds', 'channel list unavailable.');
  }
} catch (e) {
  record(false, 'build config coherence', e.message);
}

// ------------------------------------------------------------- env var parity
console.log('\nEnvironment parity');
try {
  const srcVars = new Set(
    sh("grep -rhoE 'process\\.env\\.EXPO_PUBLIC_[A-Z0-9_]+' src/ || true")
      .split('\n')
      .filter(Boolean)
      .map((m) => m.replace('process.env.', '')),
  );
  const easCfg = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  const profiles = Object.entries(easCfg.build).filter(([, p]) => p.channel === CHANNEL);
  const profileVars = new Set(profiles.flatMap(([, p]) => Object.keys(p.env ?? {})));

  const envRaw = eas(['env:list', ENVIRONMENT, '--format', 'short']);
  if (envRaw === null) {
    record(false, `read EAS environment "${ENVIRONMENT}"`, 'eas env:list failed — OTA env cannot be verified.');
  } else {
    const serverVars = new Set(
      envRaw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('EXPO_PUBLIC_'))
        .map((l) => l.split('=')[0]),
    );
    const shipped = [...srcVars].filter((v) => !DEV_ONLY_VARS.has(v));

    // The July 7 failure mode: a var the code reads but the OTA env lacks is
    // silently undefined in the delivered bundle.
    const missingOnServer = shipped.filter((v) => !serverVars.has(v));
    record(
      missingOnServer.length === 0,
      `every shipped EXPO_PUBLIC_* exists in EAS environment "${ENVIRONMENT}"`,
      missingOnServer.length
        ? `MISSING (OTA would strip these):\n${missingOnServer.join('\n')}\nFix: eas env:create --environment ${ENVIRONMENT}`
        : `${shipped.length} shipped var(s) checked against ${serverVars.size} on the server` +
          (DEV_ONLY_VARS.size ? `; ${DEV_ONLY_VARS.size} dev-only var(s) excluded by design` : ''),
    );

    // Inverse: a dev-only var present here would ship a secret to users.
    const leaked = [...DEV_ONLY_VARS].filter((v) => serverVars.has(v) || profileVars.has(v));
    record(
      leaked.length === 0,
      'no dev-only var is present in the shipping environment or build profiles',
      leaked.length
        ? `LEAK RISK — these are dev-only and must not ship:\n${leaked.join('\n')}`
        : null,
    );

    const missingInProfiles = shipped.filter((v) => !profileVars.has(v));
    record(
      missingInProfiles.length === 0,
      `build profile(s) for "${CHANNEL}" carry the same vars`,
      missingInProfiles.length
        ? `Missing from eas.json profile(s) ${profiles.map(([n]) => n).join(', ')}:\n${missingInProfiles.join('\n')}`
        : null,
    );
  }
} catch (e) {
  record(false, 'environment parity', e.message);
}

// -------------------------------------------------------------------- verdict
console.log('\n' + '─'.repeat(64));
const failures = results.filter((r) => !r.ok);
if (failed) {
  console.log(`PREFLIGHT FAILED — ${failures.length} check(s) did not pass:`);
  for (const f of failures) console.log(`  ✗ ${f.label}`);
  console.log('\nDo not build or publish until these are resolved.\n');
  process.exit(1);
}
console.log(`PREFLIGHT PASSED — ${results.length} checks.`);
console.log(`Publish target: channel "${CHANNEL}", environment "${ENVIRONMENT}".`);
console.log(`  eas update --channel ${CHANNEL} --environment ${ENVIRONMENT} --message "..."\n`);
