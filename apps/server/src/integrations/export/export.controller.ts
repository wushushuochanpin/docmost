import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ExportService } from './export.service';
import {
  ExportPageDto,
  ExportPagePdfDto,
  ExportSpaceDto,
  PrintPageDto,
} from './dto/export-dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { FastifyReply } from 'fastify';
import { getExportExtension } from './utils';
import {
  getMimeType,
  getPageTitle,
  sanitizeFileName,
} from '../../common/helpers';
import * as path from 'path';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { PdfExportService } from './pdf-export.service';

@Controller()
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly pdfExportService: PdfExportService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/export')
  async exportPage(
    @Body() dto: ExportPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    const result = await this.exportService.exportPages(
      dto.pageId,
      workspace.id,
      dto.format,
      dto.includeAttachments,
      dto.includeChildren,
      user.id,
    );

    this.auditService.log({
      event: AuditEvent.PAGE_EXPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        format: dto.format,
        includeChildren: dto.includeChildren,
        includeAttachments: dto.includeAttachments,
        spaceId: page.spaceId,
      },
    });

    if (result.type === 'file') {
      const ext = getExportExtension(dto.format);
      const fileName =
        sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
        ext;
      const contentType = getMimeType(path.extname(fileName));

      res.headers({
        'Content-Type': contentType,
        'Content-Disposition':
          'attachment; filename="' + encodeURIComponent(fileName) + '"',
      });

      res.send(result.content);
    } else {
      const fileName =
        sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
        '.zip';

      res.headers({
        'Content-Type': 'application/zip',
        'Content-Disposition':
          'attachment; filename="' + encodeURIComponent(fileName) + '"',
      });

      res.send(result.stream);
    }
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/export/pdf')
  async exportPagePdf(
    @Body() dto: ExportPagePdfDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    const pdfBuffer = await this.pdfExportService.exportPagePdf(page, user.id);

    this.auditService.log({
      event: AuditEvent.PAGE_EXPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        format: 'pdf',
        spaceId: page.spaceId,
      },
    });

    const fileName =
      sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
      '.pdf';

    res.headers({
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="' + encodeURIComponent(fileName) + '"',
      'Content-Length': String(pdfBuffer.length),
    });

    res.send(pdfBuffer);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/print-html')
  async getPagePrintHtml(
    @Body() dto: PrintPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      workspaceId: workspace.id,
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.pdfExportService.getPagePrintHtml(page, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('spaces/export')
  async exportSpace(
    @Body() dto: ExportSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }

    const exportFile = await this.exportService.exportSpace(
      dto.spaceId,
      workspace.id,
      dto.format,
      dto.includeAttachments,
      user.id,
    );

    this.auditService.log({
      event: AuditEvent.SPACE_EXPORTED,
      resourceType: AuditResource.SPACE,
      resourceId: dto.spaceId,
      spaceId: dto.spaceId,
      metadata: {
        format: dto.format,
        includeAttachments: dto.includeAttachments ?? false,
        spaceName: exportFile.spaceName,
      },
    });

    res.headers({
      'Content-Type': 'application/zip',
      'Content-Disposition':
        'attachment; filename="' +
        encodeURIComponent(
          sanitizeFileName(exportFile.fileName, { preserveSpaces: true }),
        ) +
        '"',
    });

    res.send(exportFile.fileStream);
  }
}
