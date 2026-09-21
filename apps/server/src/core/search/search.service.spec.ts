import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PageNodeMetaRepo } from '@docmost/db/repos/page/page-node-meta.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SearchService } from './search.service';
import { TokenService } from '../auth/services/token.service';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: PageRepo, useValue: {} },
        { provide: ShareRepo, useValue: {} },
        { provide: PageNodeMetaRepo, useValue: {} },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: PagePermissionRepo, useValue: {} },
        { provide: TokenService, useValue: {} },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
