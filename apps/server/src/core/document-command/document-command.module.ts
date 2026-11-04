import { AgentMaintenanceService } from '../agent-operations/agent-maintenance.service';
import { AgentCredentialModule } from '../agent-credentials/agent-credential.module';
import { DocumentRuntimeController } from './document-runtime.controller';
import { Module } from '@nestjs/common';
import { DocumentCommandService } from './document-command.service';
@Module({
  imports: [AgentCredentialModule],
  controllers: [DocumentRuntimeController],
  providers: [DocumentCommandService, AgentMaintenanceService],
  exports: [DocumentCommandService],
})
export class DocumentCommandModule {}
