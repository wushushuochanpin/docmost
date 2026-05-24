import { Module } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { TrashCleanupService } from './services/trash-cleanup.service';
import { BacklinkService } from './services/backlink.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { WatcherModule } from '../watcher/watcher.module';
import { ShareModule } from '../share/share.module';
import { EditorSessionModule } from '../editor-session/editor-session.module';
import { TransclusionModule } from './transclusion/transclusion.module';
import { LabelModule } from '../label/label.module';

@Module({
  controllers: [PageController],
  providers: [
    PageService,
    PageHistoryService,
    TrashCleanupService,
    BacklinkService,
  ],
  exports: [PageService, PageHistoryService],
  imports: [
    StorageModule,
    CollaborationModule,
    WatcherModule,
    ShareModule,
    EditorSessionModule,
    TransclusionModule,
    LabelModule,
  ],
})
export class PageModule {}
