import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageNodeMetaRepo } from '@docmost/db/repos/page/page-node-meta.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceSidebarCategoryRepo } from '@docmost/db/repos/space/space-sidebar-category.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { QueueName } from '../../integrations/queue/constants';
import { StorageService } from '../../integrations/storage/storage.service';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { WatcherService } from '../watcher/watcher.service';
import { EditorSessionService } from '../editor-session/editor-session.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageController } from './page.controller';
import { PageService } from './services/page.service';
import { PageHistoryService } from './services/page-history.service';
import { BacklinkService } from './services/backlink.service';
import { PageAccessService } from './page-access/page-access.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { ShareStaticRendererService } from '../share/share-static-renderer.service';
import { LabelService } from '../label/label.service';
import { TransclusionService } from './transclusion/transclusion.service';

describe('PageController', () => {
  let controller: PageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        PageService,
        // Infra / persistence dependencies of PageService and PageController
        // are stubbed: these specs only assert the module graph instantiates.
        { provide: PageRepo, useValue: {} },
        { provide: PageNodeMetaRepo, useValue: {} },
        { provide: PagePermissionRepo, useValue: {} },
        { provide: SpaceSidebarCategoryRepo, useValue: {} },
        { provide: AttachmentRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: getQueueToken(QueueName.ATTACHMENT_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.AI_QUEUE), useValue: {} },
        { provide: getQueueToken(QueueName.GENERAL_QUEUE), useValue: {} },
        { provide: EventEmitter2, useValue: {} },
        { provide: CollaborationGateway, useValue: {} },
        { provide: WatcherService, useValue: {} },
        { provide: EditorSessionService, useValue: {} },
        { provide: TransclusionService, useValue: {} },
        { provide: PageHistoryService, useValue: {} },
        { provide: BacklinkService, useValue: {} },
        { provide: PageAccessService, useValue: {} },
        { provide: SpaceAbilityFactory, useValue: {} },
        { provide: ShareStaticRendererService, useValue: {} },
        { provide: LabelService, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
