import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { IntegrationTokenController } from './controllers/integration-token.controller';
import { IntegrationTokenService } from './services/integration-token.service';
import { IntegrationTokenRepo } from './repos/integration-token.repo';
import { CaslModule } from '../casl/casl.module';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [TokenModule, CaslModule, AuditLogModule],
  controllers: [IntegrationTokenController],
  providers: [
    IntegrationTokenService,
    IntegrationTokenRepo,
    UserRepo,
    WorkspaceRepo,
  ],
  exports: [IntegrationTokenService],
})
export class IntegrationTokenModule {}
