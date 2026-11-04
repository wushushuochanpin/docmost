import { useEffect, useState } from "react";
import { Badge, Button, Group, Stack, Text, Divider } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import { Connection, Page, statusLabels, useAgentData } from "./api";
import { listMcpTokens, McpToken } from "../mcp-tokens/api";
import { AgentPager, AgentState, connectionPath } from "./shared";

export default function ConnectionsPage() {
  const [params, setParams] = useSearchParams(),
    cursor = params.get("cursor") ?? "";
  const { data, error, loading, refresh } = useAgentData<Page<Connection>>(
    "/agent-connections?cursor=" +
      encodeURIComponent(cursor || "") +
      "&page_size=20",
  );
  const [tokens, setTokens] = useState<McpToken[]>();
  useEffect(() => {
    let active = true;
    listMcpTokens({ page_size: 20 })
      .then((page) => active && setTokens(page.items))
      .catch(() => active && setTokens([]));
    return () => {
      active = false;
    };
  }, []);
  return (
    <Stack>
      <SettingsTitle title="我的 Agent 连接" />
      <Text size="sm" c="dimmed">
        OAuth 连接由 Agent 发起授权；MCP 令牌由你创建并选择空间与权限。两者独立存储，
        都默认只读，均可在此查看、缩权或撤销。
      </Text>
      <Group>
        <Button variant="default" onClick={refresh}>
          刷新
        </Button>
        <Button component={Link} to="/settings/account/mcp-tokens">
          管理 MCP 令牌
        </Button>
      </Group>
      <AgentState loading={loading} error={error} retry={refresh}>
        {!data?.items.length ? (
          <Text c="dimmed">
            暂无连接。从 Agent 发起授权后，可在这里管理访问范围。
          </Text>
        ) : (
          data.items.map((item) => (
            <div key={item.id}>
              <Group justify="space-between" wrap="wrap">
                <Stack gap={4}>
                  <Text fw={500}>{item.name}</Text>
                  {item.source === "dcr" ? (
                    <Badge color="grape" variant="light">未验证应用</Badge>
                  ) : null}
                  <Text size="sm" c="dimmed">
                    {statusLabels[item.status]} · 到期：
                    {new Date(item.expiresAt).toLocaleDateString()}
                  </Text>
                </Stack>
                <Button
                  variant="subtle"
                  component={Link}
                  to={connectionPath + "/" + item.id}
                >
                  查看连接
                </Button>
              </Group>
              <Divider my="sm" />
            </div>
          ))
        )}
        <AgentPager
          cursor={cursor}
          next={data?.next_cursor}
          setCursor={(v) => setParams(v ? { cursor: v } : {})}
        />
      </AgentState>
      <Divider my="md" />
      <Group justify="space-between">
        <Text fw={500}>MCP 令牌</Text>
        <Button
          variant="subtle"
          component={Link}
          to="/settings/account/mcp-tokens"
        >
          查看全部
        </Button>
      </Group>
      {!tokens?.length ? (
        <Text c="dimmed" size="sm">
          暂无 MCP 令牌。需要独立令牌时，请创建一个并选择空间与权限。
        </Text>
      ) : (
        <Stack gap="xs">
          {tokens.map((token) => (
            <Group key={token.id} justify="space-between" wrap="wrap">
              <Stack gap={2}>
                <Text fw={500}>{token.name}</Text>
                <Text size="sm" c="dimmed">
                  {token.spaces.map((space) => space.name).join("、") ||
                    "未选择空间"}
                </Text>
              </Stack>
              <Group gap="xs">
                <Badge color={token.status === "active" ? "green" : "gray"}>
                  {token.status === "active"
                    ? "有效"
                    : token.status === "expired"
                      ? "已过期"
                      : "已撤销"}
                </Badge>
                <Button
                  variant="subtle"
                  component={Link}
                  to="/settings/account/mcp-tokens"
                >
                  管理
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
