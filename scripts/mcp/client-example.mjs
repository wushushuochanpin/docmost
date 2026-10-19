// Public-client example. Tokens stay in memory; no browser cookies or secrets are accepted.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const require = createRequire(
  new URL("../../apps/server/package.json", import.meta.url),
);
const { auth } = require("@modelcontextprotocol/sdk/client/auth.js");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
  UnauthorizedError,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const args = process.argv.slice(2);
const value = (key) => args[args.indexOf(key) + 1];
if (!args.includes("--server") || !args.includes("--client-id")) {
  console.error(
    "Usage: node scripts/mcp/client-example.mjs --server https://HOST/mcp --client-id ID [--exercise-writes --space UUID]",
  );
  process.exit(1);
}
const serverUrl = new URL(value("--server"));
if (
  serverUrl.protocol !== "https:" &&
  !(serverUrl.protocol === "http:" && serverUrl.hostname === "127.0.0.1")
)
  throw Error("HTTPS required except loopback");
const writes = args.includes("--exercise-writes");
if (writes && !args.includes("--space"))
  throw Error("--space required for explicit write exercise");
const scopes = writes
  ? "knowledge.read pages.create folders.create pages.edit"
  : "knowledge.read";
const state = randomUUID();
let tokens, verifier, authorizeUrl, resolveCode, rejectCode;
const codePromise = new Promise((resolve, reject) => {
  resolveCode = resolve;
  rejectCode = reject;
});
// Suppress unhandled rejection while waiting for initial discovery; it is awaited below.
codePromise.catch(() => {});
const listener = createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (u.pathname !== "/callback" || u.searchParams.get("state") !== state) {
    res.writeHead(400).end("Invalid callback");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (u.searchParams.has("error") || !u.searchParams.get("code")) {
    res.writeHead(400).end("Authorization rejected");
    rejectCode(Error("Authorization rejected"));
    return;
  }
  res.end("Authorization received. Return to the client.");
  resolveCode(u.searchParams.get("code"));
});
const sockets = new Set();
listener.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const callback = `http://127.0.0.1:${listener.address().port}/callback`;
const timeout = setTimeout(
  () => rejectCode(Error("Authorization timeout")),
  120000,
);
const provider = {
  redirectUrl: callback,
  clientMetadata: {
    redirect_uris: [callback],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: scopes,
  },
  state: () => state,
  clientInformation: () => ({ client_id: value("--client-id") }),
  tokens: () => tokens,
  saveTokens: (v) => {
    tokens = v;
  },
  saveCodeVerifier: (v) => {
    verifier = v;
  },
  codeVerifier: () => verifier,
  redirectToAuthorization: (u) => {
    authorizeUrl = u;
    console.log(JSON.stringify({ event: "authorize", url: u.href }));
  },
};
let client, transport;
const connect = async () => {
  client = new Client({ name: "docmost-public-example", version: "1.0.0" });
  transport = new StreamableHTTPClientTransport(serverUrl, {
    authProvider: provider,
  });
  await client.connect(transport);
};
try {
  // Explicit requested scope avoids treating the server's minimum read scope as the desired write scope.
  const authorization = await auth(provider, { serverUrl, scope: scopes });
  if (authorization === "REDIRECT") {
    const code = await codePromise;
    const exchanged = await auth(provider, {
      serverUrl,
      scope: scopes,
      authorizationCode: code,
    });
    if (exchanged !== "AUTHORIZED")
      throw Error("Token exchange did not authorize");
    console.log(JSON.stringify({ event: "stage", stage: "authorized" }));
  }
  await connect();
  console.log(JSON.stringify({ event: "stage", stage: "connected" }));
  clearTimeout(timeout);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  const checks = ["discovery", "OAuth PKCE resource binding", "tools/list"];
  const call = async (name, input) => {
    console.log(JSON.stringify({ event: "stage", stage: name }));
    const result = await client.callTool({ name, arguments: input });
    if (result.isError)
      throw Error("Tool rejected: " + (result.structuredContent?.code ?? name));
    return result.structuredContent;
  };
  await call("list_spaces", {});
  if (writes) {
    if (tools.length !== 11) throw Error("Expected all 11 tools");
    const folder = await call("create_folder", {
      space_id: value("--space"),
      title: "MCP compatibility exercise",
      idempotency_key: randomUUID(),
    });
    const input = {
      space_id: value("--space"),
      parent_id: folder.page_id,
      title: "MCP SDK exercise",
      markdown: "Created through the public example.",
      idempotency_key: randomUUID(),
    };
    const page = await call("create_page", input);
    const replay = await call("create_page", input);
    if (
      page.status !== "committed" ||
      replay.operation_id !== page.operation_id
    )
      throw Error("Creation persistence/idempotency failed");
    const context = await call("get_edit_context", { page_id: page.page_id });
    const edit = {
      page_id: page.page_id,
      version_token: context.version_token,
      idempotency_key: randomUUID(),
      ops: [{ type: "append", markdown: "Edited through the public example." }],
    };
    await call("edit_page", { ...edit, preview: true });
    const result = await call("edit_page", edit);
    if (result.status !== "committed") throw Error("Edit did not commit");
    if ((await call("edit_page", edit)).operation_id !== result.operation_id)
      throw Error("Edit replay failed");
    if (
      (await call("get_operation", { operation_id: result.operation_id }))
        .status !== "committed"
    )
      throw Error("Operation not durable");
    const read = await client.callTool({
      name: "fetch",
      arguments: { id: page.page_id },
    });
    if (
      read.isError ||
      !JSON.stringify(read).includes("Edited through the public example.")
    )
      throw Error("Read after write failed");
    checks.push(
      "create_folder",
      "create_page",
      "preview",
      "edit_page",
      "idempotent create/edit",
      "read-after-write",
      "get_operation",
    );
    // Revoke this token family. User-facing connection revocation revokes all its families.
    const authMetadata = await (
      await fetch(new URL("/.well-known/oauth-authorization-server", serverUrl))
    ).json();
    const form = new URLSearchParams({
      client_id: value("--client-id"),
      token: tokens.refresh_token,
    });
    const revoke = await fetch(authMetadata.revocation_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    await revoke.arrayBuffer();
    if (!revoke.ok) throw Error("Revocation failed");
    const old = await fetch(serverUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokens.access_token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    await old.arrayBuffer();
    if (old.status !== 401) throw Error("Old access token accepted");
    const refresh = await fetch(authMetadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: value("--client-id"),
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        resource: serverUrl.href,
      }),
    });
    await refresh.arrayBuffer();
    if (refresh.status !== 400) throw Error("Old refresh token accepted");
    checks.push("revoke", "old access rejected", "old refresh rejected");
  }
  console.log(
    JSON.stringify({
      event: "result",
      status: "passed",
      sdk: JSON.parse(
        readFileSync(
          resolve(
            dirname(
              require.resolve("@modelcontextprotocol/sdk/client/index.js"),
            ),
            "../../../package.json",
          ),
          "utf8",
        ),
      ).version,
      protocol: transport.protocolVersion,
      tools,
      checks,
      writes,
    }),
  );
} catch (error) {
  // Never print OAuth responses, callback codes, tokens, or full request bodies.
  console.error(
    JSON.stringify({
      event: "failed",
      code: error.constructor.name,
      message:
        error instanceof UnauthorizedError
          ? "Authorization required"
          : "Exercise failed; check server audit and client configuration",
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await client?.close();
  await new Promise((resolve) => {
    listener.close(resolve);
    for (const socket of sockets) socket.destroy();
  });
  tokens = undefined;
}
