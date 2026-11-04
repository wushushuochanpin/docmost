import { Module } from '@nestjs/common';
import { AgentOAuthModule } from '../agent-oauth/agent-oauth.module';
import { AgentCredentialService } from './agent-credential.service';

@Module({
  imports: [AgentOAuthModule],
  providers: [AgentCredentialService],
  exports: [AgentCredentialService],
})
export class AgentCredentialModule {}
