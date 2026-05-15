import { Module } from '@nestjs/common';
import { EditorSessionController } from './editor-session.controller';
import { EditorSessionService } from './editor-session.service';
import { PageAccessModule } from '../page/page-access/page-access.module';

@Module({
  imports: [PageAccessModule],
  controllers: [EditorSessionController],
  providers: [EditorSessionService],
  exports: [EditorSessionService],
})
export class EditorSessionModule {}
