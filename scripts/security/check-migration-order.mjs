#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const migrationDir = path.join(rootDir, "apps/server/src/database/migrations");
const migrationPathPrefix = "apps/server/src/database/migrations/";
const migrationFilePattern = /^(\d{8}T\d{6})-.+\.ts$/;

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isMigrationPath(filePath) {
  return (
    filePath.startsWith(migrationPathPrefix) &&
    filePath.endsWith(".ts") &&
    !filePath.endsWith(".d.ts")
  );
}

function parseTimestamp(fileName) {
  const match = migrationFilePattern.exec(fileName);
  return match?.[1] ?? null;
}

async function listCurrentMigrationFiles() {
  const entries = await fs.readdir(migrationDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (fileName) => fileName.endsWith(".ts") && !fileName.endsWith(".d.ts"),
    )
    .sort();
}

function listBaseMigrationPaths(baseRef) {
  const output = runGit([
    "ls-tree",
    "-r",
    "--name-only",
    baseRef,
    "apps/server/src/database/migrations",
  ]);

  if (!output) {
    return [];
  }

  return output.split("\n").filter(isMigrationPath).sort();
}

function getMergeBase() {
  const baseBranch = process.env.GITHUB_BASE_REF;
  if (!baseBranch) {
    return null;
  }

  const baseRef = `origin/${baseBranch}`;
  const mergeBase = runGit(["merge-base", "HEAD", baseRef]);
  return mergeBase || null;
}

function getChangedMigrationStatuses(baseRef) {
  const output = runGit([
    "diff",
    "--name-status",
    "--find-renames",
    `${baseRef}..HEAD`,
    "--",
    "apps/server/src/database/migrations",
  ]);

  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.some(isMigrationPath));
}

function maxTimestampFromPaths(paths) {
  return paths.reduce((max, filePath) => {
    const timestamp = parseTimestamp(path.basename(filePath));
    return timestamp && timestamp > max ? timestamp : max;
  }, "");
}

async function main() {
  const violations = [];
  const currentFileNames = await listCurrentMigrationFiles();
  const seenTimestamps = new Map();

  for (const fileName of currentFileNames) {
    const timestamp = parseTimestamp(fileName);
    if (!timestamp) {
      violations.push(
        `migration filename must start with YYYYMMDDTHHMMSS-: ${fileName}`,
      );
      continue;
    }

    const previousFileName = seenTimestamps.get(timestamp);
    if (previousFileName) {
      violations.push(
        `duplicate migration timestamp ${timestamp}: ${previousFileName}, ${fileName}`,
      );
    }
    seenTimestamps.set(timestamp, fileName);
  }

  const sortedByTimestamp = [...currentFileNames].sort((a, b) => {
    const timestampA = parseTimestamp(a) ?? "";
    const timestampB = parseTimestamp(b) ?? "";
    return timestampA.localeCompare(timestampB) || a.localeCompare(b);
  });

  if (currentFileNames.join("\n") !== sortedByTimestamp.join("\n")) {
    violations.push(
      "migration filenames are not lexicographically ordered by timestamp",
    );
  }

  const mergeBase = getMergeBase();
  if (mergeBase) {
    const baseMigrationPaths = listBaseMigrationPaths(mergeBase);
    const maxBaseTimestamp = maxTimestampFromPaths(baseMigrationPaths);
    const baseMigrationPathSet = new Set(baseMigrationPaths);
    const currentMigrationPathSet = new Set(
      currentFileNames.map((fileName) => `${migrationPathPrefix}${fileName}`),
    );

    for (const basePath of baseMigrationPathSet) {
      if (!currentMigrationPathSet.has(basePath)) {
        violations.push(
          `existing migration was removed or renamed: ${basePath}`,
        );
      }
    }

    for (const parts of getChangedMigrationStatuses(mergeBase)) {
      const [status, firstPath, secondPath] = parts;
      const changedPath = secondPath ?? firstPath;

      if (!isMigrationPath(changedPath)) {
        continue;
      }

      if (status.startsWith("A")) {
        const timestamp = parseTimestamp(path.basename(changedPath));
        if (timestamp && maxBaseTimestamp && timestamp <= maxBaseTimestamp) {
          violations.push(
            `new migration must be later than latest base migration ${maxBaseTimestamp}: ${changedPath}`,
          );
        }
        continue;
      }

      if (status.startsWith("M")) {
        violations.push(
          `existing migration was modified; create a new follow-up migration instead: ${changedPath}`,
        );
        continue;
      }

      if (status.startsWith("D") || status.startsWith("R")) {
        violations.push(
          `migration files are append-only after merge; do not delete or rename: ${parts.slice(1).join(" -> ")}`,
        );
      }
    }
  }

  if (violations.length === 0) {
    console.log("Migration order check passed.");
    return;
  }

  console.error("Migration order check failed.");
  console.error(
    "Migrations are append-only after merge. Add new migrations with a timestamp later than the latest migration on the base branch.",
  );

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
