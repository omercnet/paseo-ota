import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const upstreamRepository =
  process.env.UPSTREAM_REPOSITORY ?? "https://github.com/getpaseo/paseo.git";
const baseTagPath = ".paseo-ota-base";
const requestedTag = process.argv[2];

function git(args, options = {}) {
  const output = execFileSync("git", args, { encoding: "utf8", ...options });
  return typeof output === "string" ? output.trim() : "";
}

function compareVersions(left, right) {
  return left.localeCompare(right, undefined, { numeric: true });
}

git(["fetch", "--force", upstreamRepository, "+refs/tags/*:refs/tags/*"]);

const tags = git(["tag", "--list", "v[0-9]*", "--sort=version:refname"])
  .split("\n")
  .filter(Boolean)
  .filter((tag) => !tag.includes("-"));
const tag = requestedTag ?? tags.at(-1);

if (!tag || !tags.includes(tag)) {
  throw new Error(`Unknown stable upstream tag: ${tag ?? "<none>"}`);
}

const currentTag = process.env.OTA_BASE_TAG ?? readFileSync(baseTagPath, "utf8").trim();
if (compareVersions(tag, currentTag) <= 0) {
  console.log(`Already based on ${currentTag}; nothing to sync.`);
  process.exit(0);
}

if (git(["status", "--porcelain"])) {
  throw new Error("Refusing to sync with uncommitted changes");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "paseo-ota-"));
const patchPath = join(temporaryDirectory, "overlay.patch");

try {
  const patch = git([
    "format-patch",
    "--stdout",
    `${currentTag}..HEAD`,
    "--",
    ".",
    ":(exclude).paseo-ota-base",
  ]);
  writeFileSync(patchPath, `${patch}\n`);
  git(["reset", "--hard", tag]);
  git(["am", "--3way", patchPath], { stdio: "inherit" });
  writeFileSync(baseTagPath, `${tag}\n`);
  git(["add", baseTagPath]);
  git(["commit", "--amend", "--no-edit"]);
  console.log(`Applied the OTA overlay to ${tag}.`);
} catch (error) {
  try {
    git(["am", "--abort"]);
  } catch {}
  throw error;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
