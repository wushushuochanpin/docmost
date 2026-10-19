import { Button, Group, Stack, Text, Divider } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import { Connection, Page, statusLabels, useAgentData } from "./api";
import { AgentPager, AgentState, connectionPath } from "./shared";
export default function ConnectionsPage() {
  const [params, setParams] = useSearchParams(),
    cursor = params.get("cursor") ?? "";
  const { data, error, loading, refresh } = useAgentData<Page<Connection>>(
    "/agent-connections?cursor=" +
      encodeURIComponent(cursor || "") +
      "&page_size=20",
  );
  return (
    <Stack>
      <SettingsTitle title="我的 Agent 连接" />
      <Group>
        <Button variant="default" onClick={refresh}>
          刷新
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
    </Stack>
  );
}
