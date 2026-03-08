import { QueryParams } from "@/lib/types.ts";

export interface IAuditLogParams extends QueryParams {
  event?: string;
  resourceType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

export interface IAuditLog {
  id: string;
  workspaceId: string;
  actorId: string | null;
  actorType: string;
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
}

export interface IAuditRetention {
  retentionDays: number;
}
