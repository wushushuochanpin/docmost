import {
  beforeHandleMessagePayload,
  Extension,
  onAuthenticatePayload,
} from '@hocuspocus/server';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { SpaceRole } from '../../common/helpers/types/permission';
import { isUserDisabled } from '../../common/helpers';
import { getPageId } from '../collaboration.util';
import { JwtCollabPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import { EditorSessionService } from '../../core/editor-session/editor-session.service';
import type { EditorSessionRef } from '../../core/editor-session/editor-session.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';

@Injectable()
export class AuthenticationExtension implements Extension {
  private readonly logger = new Logger(AuthenticationExtension.name);

  constructor(
    private tokenService: TokenService,
    private userRepo: UserRepo,
    private pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly editorSessionService: EditorSessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onAuthenticate(data: onAuthenticatePayload) {
    const { documentName, token } = data;
    const pageId = getPageId(documentName);

    let jwtPayload: JwtCollabPayload;

    try {
      jwtPayload = await this.tokenService.verifyJwt(token, JwtType.COLLAB);
    } catch (error) {
      throw new UnauthorizedException('Invalid collab token');
    }

    const userId = jwtPayload.sub;
    const workspaceId = jwtPayload.workspaceId;

    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    const page = await this.pageRepo.findById(pageId, { workspaceId });
    if (!page) {
      this.logger.debug(`Page not found: ${pageId}`);
      throw new NotFoundException('Page not found');
    }

    if (page.workspaceId !== workspaceId) {
      this.logger.warn(
        `Workspace mismatch for collab page=${pageId} user=${user.id}`,
      );
      throw new UnauthorizedException();
    }

    const userSpaceRoles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      page.spaceId,
    );

    const userSpaceRole = findHighestUserSpaceRole(userSpaceRoles);

    if (!userSpaceRole) {
      this.logger.warn(`User not authorized to access page: ${pageId}`);
      throw new UnauthorizedException();
    }

    // Check page-level permissions
    const { hasAnyRestriction, canAccess, canEdit } =
      await this.pagePermissionRepo.canUserEditPage(user.id, page.id);

    if (hasAnyRestriction) {
      if (!canAccess) {
        this.logger.warn(
          `User ${user.id} denied page-level access to page: ${pageId}`,
        );
        throw new UnauthorizedException();
      }

      if (!canEdit) {
        data.connectionConfig.readOnly = true;
        this.logger.debug(
          `User ${user.id} granted readonly access to restricted page: ${pageId}`,
        );
      }
    } else {
      // No restrictions - use space-level permissions
      if (userSpaceRole === SpaceRole.READER) {
        data.connectionConfig.readOnly = true;
        this.logger.debug(`User granted readonly access to page: ${pageId}`);
      }
    }

    if (page.deletedAt) {
      data.connectionConfig.readOnly = true;
    }

    const shouldValidateEditorSession =
      !data.connectionConfig.readOnly &&
      this.environmentService.isEditorSessionEnabled() &&
      this.environmentService.isEditorSessionCollabValidate();
    const editSession = shouldValidateEditorSession
      ? this.parseEditSession(data.requestParameters)
      : null;

    if (shouldValidateEditorSession) {
      if (!jwtPayload.sessionId) {
        throw new UnauthorizedException('Missing collab session');
      }

      await this.editorSessionService.validateCollabConnection({
        workspaceId,
        userId: user.id,
        pageId,
        editSession,
      });
    }

    this.logger.debug(`Authenticated user ${user.id} on page ${pageId}`);

    return {
      user,
      editSession,
    };
  }

  async beforeHandleMessage(data: beforeHandleMessagePayload) {
    if (data.connection.readOnly) {
      return;
    }

    const pageId = getPageId(data.documentName);
    await this.editorSessionService.validateCollabConnection({
      workspaceId: data.context?.user?.workspaceId,
      userId: data.context?.user?.id,
      pageId,
      editSession: data.context?.editSession ?? null,
    });
  }

  private parseEditSession(
    requestParameters: URLSearchParams,
  ): EditorSessionRef | null {
    const raw = requestParameters.get('editSession');
    if (!raw) return null;

    try {
      return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    } catch {
      try {
        return JSON.parse(raw);
      } catch {
        throw new UnauthorizedException('Invalid editor session');
      }
    }
  }
}
