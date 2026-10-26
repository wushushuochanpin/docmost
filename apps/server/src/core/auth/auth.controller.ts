import {
  Body,
  UnauthorizedException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
  FORGOT_PASSWORD_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { SetupGuard } from './guards/setup.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { VerifyUserTokenDto } from './dto/verify-user-token.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { validateSsoEnforcement } from './auth.util';
import { ModuleRef } from '@nestjs/core';
import { IdentityService } from '../identity/identity.service';
import { IDENTITY_BROWSER_COOKIE } from '../identity/identity.security';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private environmentService: EnvironmentService,
    private moduleRef: ModuleRef,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private readonly identityService: IdentityService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() loginInput: LoginDto,
    @Req() req: FastifyRequest,
  ) {
    validateSsoEnforcement(workspace);

    let MfaModule: any;
    let isMfaModuleReady = false;
    let mfaLoadError: Error | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      MfaModule = require('./../../ee/mfa/services/mfa.service');
      isMfaModuleReady = true;
    } catch (err) {
      mfaLoadError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `MFA module failed to load: ${mfaLoadError.message}. ` +
          `MFA enforcement may be bypassed if workspace.enforceMfa is set.`,
      );
      isMfaModuleReady = false;
    }

    // If the workspace enforces MFA but the MFA module is unavailable,
    // reject the login rather than silently bypassing MFA.
    if (workspace.enforceMfa && !isMfaModuleReady) {
      this.logger.error(
        `Login blocked: workspace ${workspace.id} enforces MFA but MFA module is unavailable`,
      );
      throw new UnauthorizedException(
        'MFA is required but is currently unavailable. Please contact your administrator.',
      );
    }

    if (isMfaModuleReady) {
      const mfaService = this.moduleRef.get(MfaModule.MfaService, {
        strict: false,
      });

      const mfaResult = await mfaService.checkMfaRequirements(
        loginInput,
        workspace,
        res,
      );

      if (mfaResult) {
        // If user has MFA enabled OR workspace enforces MFA, require MFA verification
        if (mfaResult.userHasMfa || mfaResult.requiresMfaSetup) {
          return {
            userHasMfa: mfaResult.userHasMfa,
            requiresMfaSetup: mfaResult.requiresMfaSetup,
            isMfaEnforced: mfaResult.isMfaEnforced,
          };
        } else if (mfaResult.authToken) {
          // User doesn't have MFA and workspace doesn't require it
          await this.identityService.cancelBrowserTransactions(
            req.cookies?.[IDENTITY_BROWSER_COOKIE],
          );
          this.setAuthCookie(res, mfaResult.authToken);
          return;
        }
      }
    }

    const authToken = await this.authService.login(loginInput, workspace.id);
    await this.identityService.cancelBrowserTransactions(
      req.cookies?.[IDENTITY_BROWSER_COOKIE],
    );
    this.setAuthCookie(res, authToken);
  }

  @UseGuards(SetupGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setupWorkspace(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() createAdminUserDto: CreateAdminUserDto,
  ) {
    const { workspace, authToken } =
      await this.authService.setup(createAdminUserDto);

    this.setAuthCookie(res, authToken);
    return workspace;
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const currentSessionId = (req.raw as any).sessionId;
    return this.authService.changePassword(
      dto,
      user.id,
      workspace.id,
      currentSessionId,
    );
  }

  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    validateSsoEnforcement(workspace);
    return this.authService.forgotPassword(forgotPasswordDto, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('password-reset')
  async passwordReset(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() passwordResetDto: PasswordResetDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const result = await this.authService.passwordReset(
      passwordResetDto,
      workspace,
    );

    if (result.requiresLogin) {
      return {
        requiresLogin: true,
      };
    }

    // Set auth cookie if no MFA is required
    this.setAuthCookie(res, result.authToken);
    return {
      requiresLogin: false,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-token')
  async verifyResetToken(
    @Body() verifyUserTokenDto: VerifyUserTokenDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authService.verifyUserToken(verifyUserTokenDto, workspace.id);
  }

  // Token renewal is authenticated collaboration traffic, not password recovery.
  @SkipThrottle({ [FORGOT_PASSWORD_THROTTLER]: true })
  @Throttle({ [AUTH_THROTTLER]: { ttl: 60_000, limit: 60 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('collab-token')
  async collabToken(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    return this.authService.getCollabToken(
      user,
      workspace,
      (req.raw as any).sessionId,
    );
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Logout must work when the identity centre is unavailable, or when a
    // login is still pending and there is no authenticated local session yet.
    const origin = req.headers.origin;
    if (
      origin !== `${req.protocol}://${req.headers.host}` ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      throw new ForbiddenException('Same-origin request required');
    }
    let actor:
      | Awaited<ReturnType<SessionService['authenticateBrowserCredential']>>
      | undefined;
    if (req.cookies?.authToken) {
      try {
        actor = await this.sessionService.authenticateBrowserCredential(
          req.cookies.authToken,
          (req.raw as any).workspaceId,
          { checkIdentity: false },
        );
      } catch (error) {
        if (
          !(error instanceof UnauthorizedException) &&
          !(
            error instanceof Error &&
            [
              'JsonWebTokenError',
              'TokenExpiredError',
              'NotBeforeError',
            ].includes(error.name)
          )
        )
          throw error;
      }
    }
    if (actor) {
      await this.sessionService.revokeSession(
        actor.sessionId,
        actor.user.id,
        actor.user.workspaceId,
      );
    }
    // Preserve the verified actor and close its live connections before browser
    // cancellation marks that same session revoked in the database.
    await this.identityService.cancelBrowserTransactions(
      req.cookies?.[IDENTITY_BROWSER_COOKIE],
    );

    res.clearCookie('authToken', {
      path: '/',
      sameSite: 'lax',
    });
    res.clearCookie(IDENTITY_BROWSER_COOKIE, { path: '/', sameSite: 'lax' });

    if (actor)
      this.auditService.logWithContext(
        {
          event: AuditEvent.USER_LOGOUT,
          resourceType: AuditResource.USER,
          resourceId: actor.user.id,
        },
        { workspaceId: actor.user.workspaceId, actorId: actor.user.id },
      );
  }

  setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
