import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        UserService,
        { provide: UserRepo, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: {} },
        { provide: WorkspaceRepo, useValue: {} },
        { provide: EnvironmentService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
