import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceSidebarCategoryRepo } from '@docmost/db/repos/space/space-sidebar-category.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SpaceController } from './space.controller';
import { SpaceService } from './services/space.service';
import { SpaceMemberService } from './services/space-member.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { LicenseCheckService } from '../../integrations/environment/license-check.service';
import { QueueName } from '../../integrations/queue/constants';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';

describe('SpaceController', () => {
  let controller: SpaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpaceController],
      providers: [
        SpaceService,
        { provide: SpaceRepo, useValue: {} },
        { provide: SpaceSidebarCategoryRepo, useValue: {} },
        { provide: SpaceMemberService, useValue: {} },
        { provide: ShareRepo, useValue: {} },
        { provide: WorkspaceRepo, useValue: {} },
        { provide: LicenseCheckService, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: {} },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: SpaceAbilityFactory, useValue: {} },
        { provide: WorkspaceAbilityFactory, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SpaceController>(SpaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
