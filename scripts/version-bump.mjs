#!/usr/bin/env node
/**
 * version-bump.mjs — computes and applies a version bump for apps/web based
 * on the size of the change vs a base ref.
 *
 * Rules:
 *  - Source of truth: apps/web/package.json
 *  - If version already differs from the base ref, nothing to bump (exit 0)
 *  - Diff size ladder vs base: <150 changed lines -> patch, <1000 -> minor, >=1000 -> major
 *  - Escapes: POMONA_SKIP_BUMP=1 or "[no-bump]" in the current commit message -> skip
 *
 * Usage:
 *   node scripts/version-bump.mjs [--base <ref>]      (default: origin/main)
 *
 * Exit codes: 0 = no bump needed or bump applied -> caller inspects git status
 *             1 = unrecoverable error
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_FILE = "apps/web/package.json";
const PATCH_LINES = 150;
const MINOR_LINES = 1000;

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const baseArg =
  baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : "origin/main";
let baseRef = baseArg; // display name
let baseSha = null; // resolved sha for git plumbing

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

// Resolve a base ref like refs/heads/main to something that exists locally
// (e.g. origin/main) so git show / git diff work in hook and CI contexts.
function resolveBase(ref) {
  const candidates = [ref];
  if (ref.startsWith("refs/heads/")) {
    const short = ref.slice("refs/heads/".length);
    candidates.push(`origin/${short}`, short);
  }
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-new-func
      return execSync(`git rev-parse --verify --quiet ${candidate}^{commit}`, {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
    } catch {}
  }
  return null;
}

function readVersion() {
  const pkg = JSON.parse(
    readFileSync(path.join(ROOT, VERSION_FILE), "utf8")
  );
  return pkg.version;
}

function baseVersion(ref) {
  return JSON.parse(git(`git show ${ref}:${VERSION_FILE}`)).version;
}function bumpedFiles() {
  let out;
  try {
    out = git(`git diff --name-only ${baseSha}...HEAD`);
  } catch {
    // merge-base may not exist for detached/push contexts; fall back to direct diff
    try {
      out = git(`git diff --name-only ${baseSha}`);
    } catch {
      return [];
    }
  }
  return out.split("\n").filter(Boolean);
}

function changedLineCount() {
  let stat;
  try {
    stat = git(`git diff --shortstat ${baseSha}...HEAD`);
  } catch {
    try {
      stat = git(`git diff --shortstat ${baseSha}`);
    } catch {
      return 0;
    }
  }
  // "5 files changed, 120 insertions(+), 40 deletions(-)"
  const ins = /(\d+) insertions?\(\+\)/.exec(stat);
  const del = /(\d+) deletions?\(-\)/.exec(stat);
  return (ins ? Number(ins[1]) : 0) + (del ? Number(del[1]) : 0);
}

function bumpVersion(version, level) {
  const parts = version.split(".").map(Number);
  parts[0] += level === "major" ? 1 : 0;
  parts[1] = level === "major" ? 0 : parts[1] + (level === "minor" ? 1 : 0);
  parts[2] = level === "patch" ? parts[2] + 1 : 0;
  return parts.join(".");
}

function writeVersion(next) {
  const file = path.join(ROOT, VERSION_FILE);
  const content = readFileSync(file, "utf8");
  const current = readVersion();
  if (!content.includes(`"version": "${current}"`)) {
    throw new Error(`Unexpected formatting in ${VERSION_FILE}`);
  }
  writeFileSync(file, content.replace(`"version": "${current}"`, `"version": "${next}"`));
}

const main = () => {
  baseSha = resolveBase(baseArg);
  if (!baseSha) {
    console.warn(`[version] Cannot resolve base ${baseArg}; skipping bump check`);
    process.exit(0);
  }

  const current = readVersion();
  let previous;
  try {
    previous = baseVersion(baseSha);
  } catch {
    console.warn(`[version] Cannot read base version at ${baseSha}; skipping bump check`);
    process.exit(0);
  }

  if (current !== previous) {
    console.log(`[version] ${current} differs from ${baseRef} (${previous}); no bump needed`);
    process.exit(0);
  }

  if (process.env.POMONA_SKIP_BUMP === "1") {
    console.log("[version] POMONA_SKIP_BUMP=1 set; skipping");
    process.exit(0);
  }

  let lastCommitMsg = "";
  try {
    lastCommitMsg = git("git log -1 --pretty=%s");
  } catch {}
  if (lastCommitMsg.includes("[no-bump]")) {
    console.log("[version] [no-bump] in commit message; skipping");
    process.exit(0);
  }

  const files = bumpedFiles();
  const sourceFiles = files.filter(
    (f) =>
      f !== VERSION_FILE &&
      f !== "pnpm-lock.yaml" &&
      !f.startsWith(".github/") &&
      !f.endsWith(".md")
  );
  if (sourceFiles.length === 0) {
    console.log("[version] No source files changed vs base; skipping bump");
    process.exit(0);
  }

  const lines = changedLineCount();
  const level = lines < PATCH_LINES ? "patch" : lines < MINOR_LINES ? "minor" : "major";
  const next = bumpVersion(current, level);
  writeVersion(next);
  console.log(`[version] Bumped ${current} -> ${next} (${level}; ${lines} changed lines vs ${baseRef})`);
};

main(); // exits via process.exit on every path
