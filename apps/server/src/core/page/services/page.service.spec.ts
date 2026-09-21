import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageNodeMetaRepo } from '@docmost/db/repos/page/page-node-meta.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceSidebarCategoryRepo } from '@docmost/db/repos/space/space-sidebar-category.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { QueueName } from '../../../integrations/queue/constants';
import { StorageService } from '../../../integrations/storage/storage.service';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import { WatcherService } from '../../watcher/watcher.service';
import { EditorSessionService } from '../../editor-session/editor-session.service';
import { PageService } from './page.service';
import { TransclusionService } from '../transclusion/transclusion.service';

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageService,
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
      ],
    }).compile();

    service = module.get<PageService>(PageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
