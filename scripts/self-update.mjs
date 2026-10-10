#!/usr/bin/env node
// VISTORA server self-updater.
//
// Checks the git remote for a newer release of the deployed branch and, if one exists,
// fast-forwards, installs, builds and tests it, then restarts the service. If any step
// fails it rolls back to the previous commit and rebuilds, so a bad release never goes live.
//
// Run it on a schedule (cron / systemd timer), e.g. every 15 minutes:
//   */15 * * * * cd /srv/vistora && RESTART_COMMAND="systemctl restart vistora" node scripts/self-update.mjs >> update.log 2>&1
//
// Environment:
//   UPDATE_REMOTE    git remote to track (default: origin)
//   UPDATE_BRANCH    branch to track (default: the currently checked-out branch)
//   RESTART_COMMAND  command that restarts the running server (e.g. "pm2 restart vistora")
//   SKIP_TESTS=1     skip `npm test` before going live (not recommended)
//   DRY_RUN=1        only report whether an update is available

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (msg) => console.log(`[vistora-update ${new Date().toISOString()}] ${msg}`);
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });
const out = (cmd) => sh(cmd, { quiet: true }).trim();

function main() {
  const remote = process.env.UPDATE_REMOTE || "origin";
  const branch = process.env.UPDATE_BRANCH || out("git rev-parse --abbrev-ref HEAD");

  if (out("git status --porcelain --untracked-files=no")) {
    log("Local changes to tracked files detected — refusing to update. Commit or stash them first.");
    process.exit(2);
  }

  log(`Checking ${remote}/${branch} for updates…`);
  sh(`git fetch --quiet ${remote} ${branch}`);
  const current = out("git rev-parse HEAD");
  const latest = out(`git rev-parse ${remote}/${branch}`);
  if (current === latest) {
    log(`Already up to date (${current.slice(0, 7)}).`);
    return;
  }
  if (out(`git merge-base --is-ancestor HEAD ${remote}/${branch} && echo yes || echo no`) !== "yes") {
    log(`${remote}/${branch} has diverged from the deployed commit — manual attention needed.`);
    process.exit(3);
  }
  log(`Update available: ${current.slice(0, 7)} → ${latest.slice(0, 7)}`);
  log(out(`git log --oneline ${current}..${latest}`));
  if (process.env.DRY_RUN === "1") return;

  try {
    sh(`git merge --ff-only --quiet ${remote}/${branch}`);
    sh("npm ci --no-audit --no-fund");
    sh("npm run build");
    if (process.env.SKIP_TESTS !== "1") sh("npm test");
  } catch (err) {
    log(`Update failed (${err.message.split("\n")[0]}). Rolling back to ${current.slice(0, 7)}…`);
    sh(`git reset --hard --quiet ${current}`);
    sh("npm ci --no-audit --no-fund");
    sh("npm run build");
    log("Rollback complete; the previous release is still running.");
    process.exit(1);
  }

  if (process.env.RESTART_COMMAND) {
    log(`Restarting: ${process.env.RESTART_COMMAND}`);
    sh(process.env.RESTART_COMMAND);
  } else {
    log("Built successfully. Set RESTART_COMMAND to restart the server automatically.");
  }
  log(`Now running ${latest.slice(0, 7)}. Open browsers will pick up the new version automatically.`);
}

main();
