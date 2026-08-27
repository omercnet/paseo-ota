import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("replays downstream commits on a newer stable tag", () => {
  const root = mkdtempSync(join(tmpdir(), "paseo-ota-sync-"));
  const upstream = join(root, "upstream.git");
  const checkout = join(root, "checkout");
  git(root, "init", "--bare", upstream);
  git(root, "clone", upstream, checkout);
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");

  writeFileSync(join(checkout, "upstream.txt"), "v1\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "upstream v1");
  git(checkout, "tag", "v1.0.0");
  writeFileSync(join(checkout, "overlay.txt"), "ota\n");
  writeFileSync(join(checkout, ".paseo-ota-base"), "v1.0.0\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "add ota overlay");
  const overlayCommit = git(checkout, "rev-parse", "HEAD");
  git(checkout, "checkout", "--detach", "v1.0.0");
  writeFileSync(join(checkout, "upstream.txt"), "v2\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "upstream v2");
  git(checkout, "tag", "v1.1.0");
  git(checkout, "push", "origin", "v1.0.0", "v1.1.0");
  git(checkout, "checkout", overlayCommit);

  execFileSync("node", [join(import.meta.dirname, "sync-upstream-tag.mjs"), "v1.1.0"], {
    cwd: checkout,
    env: { ...process.env, UPSTREAM_REPOSITORY: upstream, OTA_BASE_TAG: "v1.0.0" },
  });
  assert.equal(readFileSync(join(checkout, "upstream.txt"), "utf8"), "v2\n");
  assert.equal(readFileSync(join(checkout, "overlay.txt"), "utf8"), "ota\n");
  assert.equal(git(checkout, "log", "-1", "--format=%s"), "add ota overlay");
});
