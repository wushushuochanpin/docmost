import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  retainWorkspace,
  retentionPolicy,
  retainUnboundRequests,
} from './agent-retention';
import { agentTelemetry } from './agent-telemetry';
@Injectable()
export class AgentMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentMaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private active = false;
  private cursor = '';
  constructor(@InjectKysely() private readonly db: KyselyDB) {}
  onModuleInit() {
    if (
      process.env.DOCUMENT_COMMAND_ENABLED !== 'true' &&
      process.env.AGENT_OAUTH_ENABLED !== 'true'
    )
      return;
    agentTelemetry.start();
    if (process.env.AGENT_RETENTION_ENABLED === 'true') retentionPolicy(''); // Fail startup on unsafe policy.
    this.timer = setInterval(() => {
      void this.tick().catch(() => {
        agentTelemetry.increment('retention_failure');
        this.logger.error({ code: 'AGENT_MAINTENANCE_FAILED' });
      });
    }, 60000);
    this.timer.unref();
  }
  async tick() {
    if (this.active) return;
    this.active = true;
    try {
      if (process.env.AGENT_RETENTION_ENABLED === 'true') {
        const workspaces = await this.db
          .selectFrom('workspaces')
          .select('id')
          .$if(!!this.cursor, (q) => q.where('id', '>', this.cursor))
          .orderBy('id')
          .limit(10)
          .execute();
        this.cursor = workspaces.length === 10 ? workspaces[9].id : '';
        for (const workspace of workspaces) {
          const result = await agentTelemetry.measure('maintenance', () =>
            retainWorkspace(
              this.db,
              workspace.id,
              retentionPolicy(workspace.id),
            ),
          );
          this.logger.log({
            code: 'AGENT_RETENTION_BATCH',
            workspaceId: workspace.id,
            ...result,
          });
        }
        const removed = await retainUnboundRequests(this.db);
        if (removed)
          this.logger.log({ code: 'AGENT_RETENTION_UNBOUND', removed });
      }
      if (process.env.AGENT_TELEMETRY_LOG_ENABLED === 'true')
        this.logger.log({
          code: 'AGENT_METRICS',
          ...agentTelemetry.snapshot(),
        });
    } finally {
      this.active = false;
    }
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    agentTelemetry.stop();
  }
}
