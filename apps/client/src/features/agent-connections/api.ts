import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import api from "@/lib/api-client";
export type Connection = {
  id: string;
  name: string;
  status: string;
  version: string;
  scopes: string[];
  spaceIds: string[];
  spaces: { id: string; name: string }[];
  expiresAt: string;
  lastUsedAt?: string;
  csrf_token: string;
};
export type Policy = {
  enabled: boolean;
  version: string;
  maxGrantDays: number;
  timezone: string;
  quotaLimits: Record<string, number>;
  hard_limits: Record<string, number>;
  csrf_token: string;
};
export type Activity = {
  actorName: string;
  id: string;
  application: string;
  tool: string;
  status: string;
  createdAt: string;
  beforeRevision?: string;
  afterRevision?: string;
  userId: string;
  pageId: string;
};
export type Page<T> = { items: T[]; next_cursor: string | null };
export const scopeLabels: Record<string, string> = {
  "knowledge.read": "读取文档",
  "pages.edit": "编辑文档",
  "pages.create": "新建文档",
  "folders.create": "新建文件夹",
};
export const statusLabels: Record<string, string> = {
  active: "已连接",
  revoked: "已撤销",
  expired: "已过期",
  suspended: "已停用",
  pending: "待确认",
  running: "处理中",
  recovering: "核对中",
  committed: "已保存",
  rejected: "未执行",
};
export const toolLabels: Record<string, string> = {
  create_page: "新建文档",
  create_folder: "新建文件夹",
  edit_page: "编辑文档",
  update_page_metadata: "修改标题",
};
export const quotaLabels: Record<string, string> = {
  read: "每分钟读取",
  write: "每分钟写入",
  query: "每分钟结果查询",
  preview: "每分钟预览",
  grant_create: "每个连接每日新建",
  grant_edit: "每个连接每日修改",
  workspace_create: "工作区每日新建",
  workspace_edit: "工作区每日修改",
  grant_concurrency: "每个连接同时执行",
  workspace_concurrency: "工作区同时执行",
};
export function useAgentData<T>(path: string | null) {
  const identity = useAtomValue(currentUserAtom),
    generation = useRef(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: number }>(
    { key: "" },
  );
  const [reload, setReload] = useState(0);
  const identityKey = JSON.stringify([
    path,
    reload,
    identity?.user?.id,
    identity?.workspace?.id,
  ]);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    const current = ++generation.current,
      abort = new AbortController();
    if (path)
      api
        .get<T>(path, { signal: abort.signal })
        .then((response) => {
          if (current === generation.current)
            setState({ key: identityKey, data: response.data });
        })
        .catch((error) => {
          if (!abort.signal.aborted && current === generation.current)
            setState({ key: identityKey, error: error.response?.status ?? 0 });
        });
    return () => {
      ++generation.current;
      abort.abort();
    };
  }, [path, identityKey]);
  const current = state.key === identityKey;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: !!path && !current,
    refresh,
    generation,
  };
}
export { api };
