// Test-process preload only: records the negotiated MCP header, never payloads or credentials.
const { Server } = require('node:http');
const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  const request = args[0];
  if (event === 'request' && request?.url === '/mcp') {
    const version = request.headers['mcp-protocol-version'];
    if (typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version))
      process.stderr.write('P2_MCP_PROTOCOL=' + version + '\n');
  }
  return emit.call(this, event, ...args);
};
