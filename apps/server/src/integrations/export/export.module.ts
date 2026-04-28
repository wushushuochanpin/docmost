import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';
import { ShareModule } from '../../core/share/share.module';
import { PdfExportService } from './pdf-export.service';

@Module({
  imports: [StorageModule, ShareModule],
  providers: [ExportService, PdfExportService],
  controllers: [ExportController],
})
export class ExportModule {}
