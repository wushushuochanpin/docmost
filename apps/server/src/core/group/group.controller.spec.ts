import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GroupController } from './group.controller';
import { GroupService } from './services/group.service';
import { GroupUserService } from './services/group-user.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';

describe('GroupController', () => {
  let controller: GroupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        GroupService,
        { provide: GroupRepo, useValue: {} },
        { provide: GroupUserRepo, useValue: {} },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: GroupUserService, useValue: {} },
        { provide: WatcherRepo, useValue: {} },
        { provide: FavoriteRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: AUDIT_SERVICE, useValue: {} },
        { provide: WorkspaceAbilityFactory, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
