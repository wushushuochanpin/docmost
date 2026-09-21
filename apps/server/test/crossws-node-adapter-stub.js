// Jest stub for `crossws/adapters/node`.
// crossws is a pure-ESM package (exports only .mjs files, no CJS build), which
// the CJS test runtime cannot load. `@hocuspocus/server` only touches the
// adapter when a WebSocket server actually starts listening, so a minimal
// stub keeps the module graph loadable for unit specs.
function nodeAdapter() {
  return {};
}

function fromNodeUpgradeHandler() {}

module.exports = { default: nodeAdapter, fromNodeUpgradeHandler };
