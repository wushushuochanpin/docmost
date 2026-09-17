import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { CreateUserDto } from '../dto/create-user.dto';
import { WorkspaceService } from '../../workspace/services/workspace.service';
import { CreateWorkspaceDto } from '../../workspace/dto/create-workspace.dto';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserRole } from '../../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

@Injectable()
export class SignupService {
  constructor(
    private userRepo: UserRepo,
    private workspaceService: WorkspaceService,
    private groupUserRepo: GroupUserRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async signup(
    createUserDto: CreateUserDto,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<User> {
    const userCheck = await this.userRepo.findByEmail(
      createUserDto.email,
      workspaceId,
    );

    if (userCheck) {
      throw new AppException(ErrorCode.USER_EMAIL_EXISTS, 'An account with this email already exists in this workspace', 400);
    }

    const user = await executeTx(
      this.db,
      async (trx) => {
        // create user
        const user = await this.userRepo.insertUser(
          {
            ...createUserDto,
            workspaceId: workspaceId,
          },
          trx,
        );

        // add user to workspace
        await this.workspaceService.addUserToWorkspace(
          user.id,
          workspaceId,
          undefined,
          trx,
        );

        // add user to default group
        await this.groupUserRepo.addUserToDefaultGroup(
          user.id,
          workspaceId,
          trx,
        );
        return user;
      },
      trx,
    );

    this.auditService.log({
      event: AuditEvent.USER_CREATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        after: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      metadata: {
        source: 'signup',
      },
    });

    return user;
  }

  async initialSetup(
    createAdminUserDto: CreateAdminUserDto,
    trx?: KyselyTransaction,
  ) {
    // Serialize setup attempts using a PostgreSQL advisory lock to prevent
    // race conditions where concurrent requests could both pass the SetupGuard
    // check and create duplicate workspaces/admin users.
    const setupLockKey = 1; // fixed lock id for workspace setup
    let lockAcquired = false;

    try {
      const lockResult = await sql<{ acquired: boolean }>`
        SELECT pg_try_advisory_lock(${setupLockKey}) AS "acquired"
      `.execute(this.db);

      lockAcquired = lockResult.rows[0]?.acquired ?? false;

      if (!lockAcquired) {
        // Another setup is already in progress — re-check if a workspace
        // was created in the meantime
        const workspaceCount = await this.db
          .selectFrom('workspaces')
          .select((eb) => eb.fn.count('id').as('count'))
          .executeTakeFirst();

        if ((workspaceCount?.count as number) > 0) {
          throw new AppException(ErrorCode.AUTH_SETUP_ALREADY_COMPLETED, 'Workspace setup already completed.', 400);
        }

        throw new AppException(ErrorCode.AUTH_SETUP_IN_PROGRESS, 'Setup is already in progress. Please try again.', 400);
      }

      let user: User,
        workspace: Workspace = null;

      await executeTx(
        this.db,
        async (trx) => {
          // Double-check inside transaction
          const existingCount = await trx
            .selectFrom('workspaces')
            .select((eb) => eb.fn.count('id').as('count'))
            .executeTakeFirst();

          if ((existingCount?.count as number) > 0) {
            throw new AppException(ErrorCode.AUTH_SETUP_ALREADY_COMPLETED, 'Workspace setup already completed.', 400);
          }

          // create user
          user = await this.userRepo.insertUser(
          {
            name: createAdminUserDto.name,
            email: createAdminUserDto.email,
            password: createAdminUserDto.password,
            role: UserRole.OWNER,
            emailVerifiedAt: new Date(),
          },
          trx,
        );

        // create workspace with full setup
        const workspaceData: CreateWorkspaceDto = {
          name: createAdminUserDto.workspaceName || 'My workspace',
          hostname: createAdminUserDto.hostname,
        };

        workspace = await this.workspaceService.create(
          user,
          workspaceData,
          trx,
        );

        user.workspaceId = workspace.id;
        return user;
      },
      trx,
    );

    return { user, workspace };
    } finally {
      if (lockAcquired) {
        await sql`SELECT pg_advisory_unlock(${setupLockKey})`.execute(this.db);
      }
    }
  }
}
