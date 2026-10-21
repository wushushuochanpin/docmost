import { AgentManagementController } from '../../src/core/agent-oauth/agent-management.controller';

describe('MCP runtime capabilities', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it.each([
    [undefined, undefined, false, false],
    ['true', 'false', true, false],
    ['false', 'true', false, true],
    ['true', 'true', true, true],
  ])(
    'reports OAuth %s independently of document commands %s',
    (oauth, commands, expectedOAuth, expectedCommands) => {
      delete process.env.AGENT_OAUTH_ENABLED;
      delete process.env.DOCUMENT_COMMAND_ENABLED;
      if (oauth !== undefined) process.env.AGENT_OAUTH_ENABLED = oauth;
      if (commands !== undefined)
        process.env.DOCUMENT_COMMAND_ENABLED = commands;
      process.env.AGENT_OAUTH_RESPONSE_KEY = 'must-not-be-returned';
      const reply = { header: jest.fn() };
      const controller = new AgentManagementController({} as any, {} as any);
      expect(controller.capabilities(reply as any)).toEqual({
        oauth_enabled: expectedOAuth,
        document_commands_enabled: expectedCommands,
      });
      expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );
});
