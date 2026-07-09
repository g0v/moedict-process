#!/usr/bin/env node
/**
 * Harness-native LemmaScript verification loop.
 *
 * Reads LemmaScript-files.txt, runs the project verifier, and treats any
 * skipped `//@ verify` function or generated-file skip marker as a failure.
 *
 * Usage:
 *   bun scripts/verify-loop.mjs              # one-shot
 *   bun scripts/verify-loop.mjs --watch      # poll listed files and re-verify
 *   bun scripts/verify-loop.mjs --command "bunx lsc check --backend=dafny"
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_POLL_MS = 500;
const DEFAULT_COMMAND = 'bun run verify';
const SKIP_MARKER = /\/\/ LemmaScript: skipped /;
function hashFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`LemmaScript manifest not found: ${manifestPath}`);
  }
  return fs
    .readFileSync(manifestPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => path.resolve(path.dirname(manifestPath), l));
}

function resolveGeneratedFiles(tsFile) {
  const base = tsFile.replace(/\.ts$/, '');
  return [`${base}.dfy.gen`, `${base}.dfy`];
}

function scanForSkips(manifestPath) {
  const files = readManifest(manifestPath);
  const skips = [];
  for (const tsFile of files) {
    for (const genFile of resolveGeneratedFiles(tsFile)) {
      if (!fs.existsSync(genFile)) continue;
      const content = fs.readFileSync(genFile, 'utf8');
      if (SKIP_MARKER.test(content)) {
        skips.push(genFile);
      }
    }
  }
  return skips;
}

function runCommand(cmd, cwd) {
  return new Promise((resolve) => {
    const parts = cmd.split(/\s+/);
    const program = parts[0];
    const args = parts.slice(1);
    const child = spawn(program, args, { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', d => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function parseOutput(stdout, stderr, code) {
  const combined = stdout + '\n' + stderr;
  const dafnyMatches = combined.match(/Dafny program verifier finished with (\d+) verified, (\d+) errors?/g);
  let dafnyVerified = 0;
  let dafnyErrors = 0;
  if (dafnyMatches) {
    for (const m of dafnyMatches) {
      const v = m.match(/(\d+) verified, (\d+) errors?/);
      if (v) {
        dafnyVerified += parseInt(v[1], 10);
        dafnyErrors += parseInt(v[2], 10);
      }
    }
  }

  const lscErrors = (combined.match(/^error:|Error:/gm) || []).length;
  const skipped = (combined.match(/skipping '[^']+'/g) || []).length;
  const unsupportedDafny = (combined.match(/Unsupported Dafny/gi) || []).length;

  return { exitCode: code, dafnyVerified, dafnyErrors, lscErrors, skipped, unsupportedDafny };
}

async function runOnce(cwd, options) {
  const manifestPath = path.resolve(cwd, options.files || 'LemmaScript-files.txt');
  const command = options.command || DEFAULT_COMMAND;
  const files = [manifestPath, ...readManifest(manifestPath)];

  console.log(`[verify-loop] manifest: ${manifestPath}`);
  console.log(`[verify-loop] command: ${command}`);
  console.log(`[verify-loop] files: ${files.length}`);

  const { code, stdout, stderr } = await runCommand(command, cwd);
  const parsed = parseOutput(stdout, stderr, code);
  const generatedSkips = scanForSkips(manifestPath);

  const failed =
    parsed.exitCode !== 0 ||
    parsed.dafnyErrors > 0 ||
    parsed.skipped > 0 ||
    parsed.unsupportedDafny > 0 ||
    generatedSkips.length > 0;

  console.log(
    `\n[verify-loop] ${failed ? 'FAILED' : 'OK'} — Dafny verified ${parsed.dafnyVerified}, errors ${parsed.dafnyErrors}, skipped ${parsed.skipped}, unsupported ${parsed.unsupportedDafny}, generated skips ${generatedSkips.length}`
  );
  if (generatedSkips.length > 0) {
    console.log('[verify-loop] skip markers found in:');
    for (const f of generatedSkips) console.log(`  - ${path.relative(cwd, f)}`);
  }

  if (failed) {
    const err = new Error('Verification failed');
    err.parsed = parsed;
    err.generatedSkips = generatedSkips;
    throw err;
  }
  return parsed;
}

function computeHash(manifestPath) {
  const files = [manifestPath, ...readManifest(manifestPath)];
  const h = crypto.createHash('md5');
  for (const f of files) {
    h.update(f);
    h.update(hashFile(f));
  }
  return h.digest('hex');
}

async function watch(cwd, options) {
  const manifestPath = path.resolve(cwd, options.files || 'LemmaScript-files.txt');
  let lastHash = computeHash(manifestPath);

  console.log(`[verify-loop] watching ${cwd}`);

  const tick = async () => {
    const currentHash = computeHash(manifestPath);
    if (currentHash === lastHash) return;
    lastHash = currentHash;
    console.log('\n[verify-loop] change detected');
    try {
      await runOnce(cwd, options);
    } catch {
      // keep watching
    }
  };

  try {
    await runOnce(cwd, options);
  } catch {
    // keep watching
  }

  setInterval(tick, options.pollInterval || DEFAULT_POLL_MS);
}

async function main() {
  const args = process.argv.slice(2);
  const watchFlag = args.includes('--watch');
  const commandIdx = args.indexOf('--command');
  const command = commandIdx !== -1 ? args[commandIdx + 1] : null;
  const filesIdx = args.indexOf('--files');
  const files = filesIdx !== -1 ? args[filesIdx + 1] : null;
  const pollIdx = args.indexOf('--poll');
  const pollInterval = pollIdx !== -1 ? parseInt(args[pollIdx + 1], 10) : DEFAULT_POLL_MS;

  const options = { watch: watchFlag, command, files, pollInterval };

  if (watchFlag) {
    await watch(process.cwd(), options);
  } else {
    await runOnce(process.cwd(), options);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
