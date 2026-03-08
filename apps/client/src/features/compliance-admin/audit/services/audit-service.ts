import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  IAuditLog,
  IAuditLogParams,
  IAuditRetention,
} from "../types/audit.types.ts";

export async function getAuditLogs(
  params?: IAuditLogParams,
): Promise<IPagination<IAuditLog>> {
  const req = await api.post<IPagination<IAuditLog>>("/audit-events/list", params);
  return req.data;
}

export async function getAuditRetention(): Promise<IAuditRetention> {
  const req = await api.post<IAuditRetention>("/audit-events/retention");
  return req.data;
}

export async function updateAuditRetention(
  retentionDays: number,
): Promise<IAuditRetention> {
  const req = await api.post<IAuditRetention>("/audit-events/retention/update", {
    retentionDays,
  });
  return req.data;
}
