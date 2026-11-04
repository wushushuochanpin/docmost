import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { Link } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import { getAppName } from "@/lib/config";
import {
  createMcpToken,
  CreatedMcpToken,
  getMcpCapabilities,
  listMcpTokens,
  McpCapabilities,
  McpScope,
  McpToken,
  McpTokenPage,
  mcpScopeLabels,
  revokeMcpToken,
  updateMcpToken,
} from "./api";

const WRITE_SCOPES: McpScope[] = [
  "pages.create",
  "folders.create",
  "pages.edit",
];

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toExpiresAt(days: string) {
  const at = new Date();
  at.setDate(at.getDate() + Number(days));
  return at.toISOString();
}

function statusLabel(status: McpToken["status"]) {
  return status === "active" ? "有效" : status === "expired" ? "已过期" : "已撤销";
}

function statusColor(status: McpToken["status"]) {
  return status === "active" ? "green" : status === "expired" ? "yellow" : "gray";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function McpTokensPage() {
  const [capabilities, setCapabilities] = useState<McpCapabilities>();
  const [page, setPage] = useState<McpTokenPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<number>();
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedMcpToken | null>(null);
  const [editing, setEditing] = useState<McpToken | null>(null);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const [caps, list] = await Promise.all([
        getMcpCapabilities(),
        listMcpTokens({ page_size: 20 }),
      ]);
      setCapabilities(caps);
      setPage(list);
    } catch (e: any) {
      setError(e.response?.status ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function refresh() {
    void load();
  }

  async function revoke(token: McpToken) {
    if (!page) return;
    try {
      await revokeMcpToken(token.id, page.csrf_token);
      setNotice("令牌已撤销，后续调用会立即被拒绝。");
      refresh();
    } catch (e: any) {
      setNotice(
        e.response?.status === 409
          ? "令牌状态已变化，请重新加载后再操作。"
          : "撤销结果待确认，请重新加载核对状态。",
      );
    }
  }

  return (
    <>
      <Helmet>
        <title>{`MCP 令牌 - ${getAppName()}`}</title>
      </Helmet>
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <SettingsTitle title="MCP 令牌" />
            <Text size="sm" c="dimmed">
              为豆包工作等 MCP 客户端创建独立令牌。默认只读，创建时选择空间与权限；
              明文只显示一次。
            </Text>
          </div>
          <Group>
            <Button variant="default" onClick={refresh}>
              刷新
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!capabilities}>
              创建 MCP 令牌
            </Button>
          </Group>
        </Group>
        <Alert color="blue">
          旧版 API 令牌保持原有 HTTP 能力和 MCP 只读行为，不会自动升级。
          需要写入请新建 MCP 令牌；新令牌只对 MCP 生效。
        </Alert>
        {notice ? <Text role="status">{notice}</Text> : null}
        {loading ? (
          <Loader aria-label="正在加载" />
        ) : error !== undefined ? (
          <Stack>
            <Alert color="red">
              {error === 403 || error === 404
                ? "无法访问此页面，请返回设置。"
                : "加载失败，请检查网络后重试。"}
            </Alert>
            <Group>
              <Button variant="default" onClick={refresh}>
                重新加载
              </Button>
              <Button component={Link} to="/settings/account/profile" variant="subtle">
                返回设置
              </Button>
            </Group>
          </Stack>
        ) : !page?.items.length ? (
          <Alert>暂无 MCP 令牌。创建后把明文复制到 Agent 配置中。</Alert>
        ) : (
          <ScrollArea>
            <Table highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>名称</Table.Th>
                  <Table.Th>空间</Table.Th>
                  <Table.Th>权限</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>到期</Table.Th>
                  <Table.Th>最近使用</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page.items.map((token) => (
                  <Table.Tr key={token.id}>
                    <Table.Td>
                      <Text fw={500}>{token.name}</Text>
                      <Text size="xs" c="dimmed">
                        版本 {token.version}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {token.spaces.map((space) => space.name).join("、") || "—"}
                    </Table.Td>
                    <Table.Td>
                      {token.scopes.map((scope) => (
                        <Badge key={scope} variant="light" mr={4}>
                          {mcpScopeLabels[scope] ?? scope}
                        </Badge>
                      ))}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(token.status)}>
                        {statusLabel(token.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDate(token.expiresAt)}</Table.Td>
                    <Table.Td>{formatDate(token.lastUsedAt)}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          disabled={token.status !== "active"}
                          onClick={() => setEditing(token)}
                        >
                          修改
                        </Button>
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          color="red"
                          disabled={token.status !== "active"}
                          onClick={() =>
                            modals.openConfirmModal({
                              title: "撤销 MCP 令牌",
                              centered: true,
                              children: (
                                <Text size="sm">
                                  撤销 <strong>{token.name}</strong>{" "}
                                  后，使用该令牌的客户端会立即失去访问。已保存到文档的修改会保留。
                                </Text>
                              ),
                              labels: { confirm: "确认撤销", cancel: "取消" },
                              confirmProps: { color: "red" },
                              onConfirm: () => void revoke(token),
                            })
                          }
                        >
                          撤销
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>

      <CreateMcpTokenModal
        opened={createOpen}
        capabilities={capabilities}
        onClose={() => setCreateOpen(false)}
        onCreated={(token) => {
          setCreateOpen(false);
          setCreated(token);
          refresh();
        }}
      />
      <OneTimeTokenModal token={created} onClose={() => setCreated(null)} />
      <EditMcpTokenModal
        token={editing}
        capabilities={capabilities}
        csrf={page?.csrf_token ?? ""}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setNotice("访问范围已更新。");
          refresh();
        }}
      />
    </>
  );
}

function ScopeFields({
  capabilities,
  scopes,
  spaces,
  onScopes,
  onSpaces,
  disabled,
}: {
  capabilities: McpCapabilities;
  scopes: McpScope[];
  spaces: string[];
  onScopes: (value: McpScope[]) => void;
  onSpaces: (value: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Checkbox.Group
        label="权限"
        value={scopes}
        onChange={(value) => onScopes(value as McpScope[])}
      >
        <Stack gap="xs" mt="xs">
          {capabilities.scopes.map((scope) => (
            <Checkbox
              key={scope}
              value={scope}
              label={`${mcpScopeLabels[scope] ?? scope}（${scope}）`}
              disabled={
                disabled ||
                scope === "knowledge.read" ||
                (!capabilities.writes_enabled && WRITE_SCOPES.includes(scope))
              }
            />
          ))}
        </Stack>
      </Checkbox.Group>
      {!capabilities.writes_enabled ? (
        <Alert color="yellow">
          工作区当前禁止 Agent 写入。你仍可创建只读令牌；如需写入，请联系管理员在
          Agent 策略中开启。
        </Alert>
      ) : null}
      <Checkbox.Group
        label="可访问空间"
        value={spaces}
        onChange={(value) => onSpaces(value)}
      >
        <Stack gap="xs" mt="xs">
          {capabilities.spaces.map((space) => (
            <Checkbox
              key={space.id}
              value={space.id}
              label={space.name}
              disabled={disabled}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      {!spaces.length ? (
        <Text size="sm" c="dimmed">
          请选择至少一个空间。
        </Text>
      ) : null}
    </>
  );
}

function CreateMcpTokenModal({
  opened,
  capabilities,
  onClose,
  onCreated,
}: {
  opened: boolean;
  capabilities?: McpCapabilities;
  onClose: () => void;
  onCreated: (token: CreatedMcpToken) => void;
}) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [scopes, setScopes] = useState<McpScope[]>(["knowledge.read"]);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writes = useMemo(
    () => scopes.some((scope) => WRITE_SCOPES.includes(scope)),
    [scopes],
  );

  useEffect(() => {
    if (opened) {
      setName("");
      setExpiry("90");
      setScopes(["knowledge.read"]);
      setSpaces([]);
      setRequest(requestId());
      setBusy(false);
      setError("");
    }
  }, [opened]);

  async function submit() {
    if (!capabilities || busy) return;
    if (!name.trim() || !spaces.length) return;
    setBusy(true);
    setError("");
    try {
      const token = await createMcpToken(
        {
          name: name.trim(),
          expiresAt: toExpiresAt(expiry),
          spaceIds: spaces,
          scopes,
          requestId: request,
        },
        capabilities.csrf_token,
      );
      onCreated(token);
    } catch (e: any) {
      setError(
        e.response?.status === 409
          ? "创建结果未知：服务端可能已创建凭据但无法再次显示明文。请到列表核对；如已创建请撤销后重新创建。"
          : e.response?.status === 403
            ? "工作区策略禁止创建带写权限的令牌，或你没有访问所选空间的权限。"
            : "创建失败，输入已保留。请重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="创建 MCP 令牌" centered size="lg">
      {capabilities ? (
        <Stack>
          {error ? <Alert color="red">{error}</Alert> : null}
          <TextInput
            label="令牌名称"
            placeholder="例如：豆包工作 · 产品库"
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Select
            label="到期时间"
            value={expiry}
            onChange={(value) => setExpiry(value ?? "90")}
            data={[
              { value: "30", label: "30 天" },
              { value: "90", label: "90 天" },
              { value: "365", label: "365 天" },
            ]}
            allowDeselect={false}
          />
          <ScopeFields
            capabilities={capabilities}
            scopes={scopes}
            spaces={spaces}
            onScopes={setScopes}
            onSpaces={setSpaces}
            disabled={busy}
          />
          <Text size="sm" c="dimmed">
            令牌明文只显示一次，关闭后无法再次查看。此令牌只用于 MCP，不会扩大其他
            HTTP API 权限。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              disabled={!name.trim() || !spaces.length || (writes && !capabilities.writes_enabled)}
            >
              创建令牌
            </Button>
          </Group>
        </Stack>
      ) : (
        <Loader />
      )}
    </Modal>
  );
}

function OneTimeTokenModal({
  token,
  onClose,
}: {
  token: CreatedMcpToken | null;
  onClose: () => void;
}) {
  return (
    <Modal opened={Boolean(token)} onClose={onClose} title="令牌已创建" centered size="lg">
      <Stack>
        <Alert color="yellow">
          只显示一次。关闭后无法再次查看；遗失请撤销后重新创建。
        </Alert>
        <Text size="sm" c="dimmed">
          名称：{token?.name}
        </Text>
        <Text
          p="md"
          style={{
            background: "var(--mantine-color-gray-0)",
            borderRadius: 8,
            fontFamily: "var(--mantine-font-family-monospace)",
            wordBreak: "break-all",
          }}
        >
          {token?.token}
        </Text>
        <Group justify="space-between">
          <Button
            variant="default"
            onClick={() =>
              token?.token &&
              navigator.clipboard
                ?.writeText(token.token)
                .then(() => undefined, () => undefined)
            }
          >
            复制令牌
          </Button>
          <Button onClick={onClose}>我已保存，关闭</Button>
        </Group>
        <Text size="sm" c="dimmed">
          如果复制失败，请手动选择上方文本复制。
        </Text>
      </Stack>
    </Modal>
  );
}

function EditMcpTokenModal({
  token,
  capabilities,
  csrf,
  onClose,
  onSaved,
}: {
  token: McpToken | null;
  capabilities?: McpCapabilities;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scopes, setScopes] = useState<McpScope[]>([]);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upgrade = useMemo(() => {
    if (!token) return false;
    return (
      scopes.some((scope) => !token.scopes.includes(scope)) ||
      spaces.some((space) => !token.spaceIds.includes(space))
    );
  }, [scopes, spaces, token]);
  const diff = useMemo(() => {
    if (!token) return { added: [], removed: [], addedSpaces: [], removedSpaces: [] };
    return {
      added: scopes.filter((scope) => !token.scopes.includes(scope)),
      removed: token.scopes.filter((scope) => !scopes.includes(scope)),
      addedSpaces: spaces.filter((space) => !token.spaceIds.includes(space)),
      removedSpaces: token.spaceIds.filter((space) => !spaces.includes(space)),
    };
  }, [scopes, spaces, token]);

  useEffect(() => {
    if (token) {
      setScopes([...token.scopes]);
      setSpaces([...token.spaceIds]);
      setConfirm(false);
      setBusy(false);
      setError("");
    }
  }, [token]);

  async function submit() {
    if (!token || !capabilities || busy) return;
    if (upgrade && !confirm) {
      setError("请先勾选确认升权。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateMcpToken(
        {
          tokenId: token.id,
          expectedVersion: token.version,
          scopes,
          spaceIds: spaces,
          confirmUpgrade: upgrade,
        },
        csrf || capabilities.csrf_token,
      );
      onSaved();
    } catch (e: any) {
      setError(
        e.response?.status === 409
          ? "令牌已变化，请重新加载后再操作。"
          : e.response?.status === 403
            ? "工作区策略禁止写入，或你没有访问所选空间的权限。"
            : "结果待确认。请重新加载核对当前范围，再决定是否重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={Boolean(token)} onClose={onClose} title={`修改 ${token?.name ?? ""}`} centered size="lg">
      {token && capabilities ? (
        <Stack>
          {error ? <Alert color="red">{error}</Alert> : null}
          {upgrade ? (
            <Alert color="yellow">
              这是升权操作。保存后立即生效，仅对 MCP 生效，不会扩大其他 HTTP API 权限。
            </Alert>
          ) : (
            <Alert color="blue">
              只能缩小范围；缩权会在最终提交前由同一事务的授权屏障判定。
            </Alert>
          )}
          {token && capabilities ? (
            <Alert color="gray">
              差异预览：新增权限{" "}
              {diff.added.map((scope) => mcpScopeLabels[scope] ?? scope).join("、") ||
                "无"}
              ；移除权限{" "}
              {diff.removed
                .map((scope) => mcpScopeLabels[scope] ?? scope)
                .join("、") || "无"}
              ；新增空间{" "}
              {diff.addedSpaces
                .map(
                  (id) =>
                    capabilities.spaces.find((space) => space.id === id)?.name ??
                    id,
                )
                .join("、") || "无"}
              ；移除空间{" "}
              {diff.removedSpaces
                .map(
                  (id) =>
                    capabilities.spaces.find((space) => space.id === id)?.name ??
                    id,
                )
                .join("、") || "无"}
              。
            </Alert>
          ) : null}
          <ScopeFields
            capabilities={capabilities}
            scopes={scopes}
            spaces={spaces}
            onScopes={setScopes}
            onSpaces={setSpaces}
            disabled={busy}
          />
          {upgrade ? (
            <Checkbox
              checked={confirm}
              onChange={(event) => setConfirm(event.currentTarget.checked)}
              label="我确认增加此令牌的权限或空间"
            />
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              disabled={!spaces.length || !scopes.length || (upgrade && !confirm)}
            >
              保存范围
            </Button>
          </Group>
        </Stack>
      ) : (
        <Loader />
      )}
    </Modal>
  );
}
