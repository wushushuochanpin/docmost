import { CanActivate, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
  ) {}

  async canActivate(): Promise<boolean> {
    if (this.environmentService.isCloud()) {
      return false;
    }

    const workspaceCount = await this.workspaceRepo.count();
    if (workspaceCount > 0) {
      throw new AppException(ErrorCode.AUTH_SETUP_ALREADY_COMPLETED, 'Workspace setup already completed.', 403);
    }
    return true;
  }
}
