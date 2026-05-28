#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

const clientConfig = read("apps/client/src/lib/config.ts");
const collaborationUrlFunction =
  clientConfig.match(
    /export function getCollaborationUrl\(\): string \{[\s\S]*?\n\}/,
  )?.[0] ?? "";

if (!collaborationUrlFunction) {
  fail("missing getCollaborationUrl() in apps/client/src/lib/config.ts");
} else {
  if (!collaborationUrlFunction.includes('getConfigValue("COLLAB_URL")')) {
    fail("getCollaborationUrl() must honor explicit COLLAB_URL overrides");
  }
  if (!collaborationUrlFunction.includes("getAppUrl()")) {
    fail("getCollaborationUrl() must default to the current browser origin");
  }
  if (collaborationUrlFunction.includes("getServerAppUrl()")) {
    fail(
      "getCollaborationUrl() must not default to APP_URL; APP_URL can point at another public domain and break /collab WebSocket routing",
    );
  }
}

const testCompose = read("docker-compose.test.yml");
if (!testCompose.includes("test-redis:")) {
  fail("docker-compose.test.yml must define an isolated test Redis service");
}
if (!testCompose.includes('REDIS_URL: "redis://test-redis:6379"')) {
  fail(
    "docker-compose.test.yml docmost service must use redis://test-redis:6379, not the production Redis alias",
  );
}
if (/REDIS_URL:\s*["']redis:\/\/redis:6379["']/.test(testCompose)) {
  fail(
    "docker-compose.test.yml must not point test docmost at production Redis",
  );
}
if (/book-test\.Xenzify\.help/i.test(testCompose)) {
  fail(
    "docker-compose.test.yml must not default TEST_APP_URL to the stale book-test.xenzify.help host",
  );
}

if (failures.length > 0) {
  console.error("Realtime deployment guard failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Realtime deployment guard passed.");
