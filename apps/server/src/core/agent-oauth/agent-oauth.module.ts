import { AgentManagementService } from './agent-management.service';
import { AgentManagementController } from './agent-management.controller';
import { Module } from '@nestjs/common';
import { AgentOAuthService } from './agent-oauth.service';
import {
  AgentOAuthController,
  AgentOAuthConsentController,
} from './agent-oauth.controller';
@Module({
  providers: [AgentOAuthService, AgentManagementService],
  controllers: [
    AgentOAuthController,
    AgentOAuthConsentController,
    AgentManagementController,
  ],
  exports: [AgentOAuthService],
})
export class AgentOAuthModule {}
