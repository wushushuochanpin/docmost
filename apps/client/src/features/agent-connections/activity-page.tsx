import { Button, Group, Select, Stack, Table, Text } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import useUserRole from "@/hooks/use-user-role";
import { Activity, Page, statusLabels, toolLabels, useAgentData } from "./api";
import { AgentPager, AgentState, connectionPath } from "./shared";
export default function AgentActivityPage() {
  const { connectionId } = useParams(),
    { isAdmin } = useUserRole(),
    [params, setParams] = useSearchParams(),
    cursor = params.get("cursor") ?? "",
    status = params.get("status") ?? "";
  const allowed = !!connectionId || isAdmin;
  const { data, error, loading, refresh } = useAgentData<Page<Activity>>(
    allowed
      ? (connectionId
          ? "/agent-connections/" + connectionId + "/operations"
          : "/agent-audit") +
          "?page_size=20" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : "") +
          (status ? "&status=" + status : "")
      : null,
  );
  return (
    <Stack>
      <Button
        variant="subtle"
        component={Link}
        to={
          connectionId
            ? connectionPath + "/" + connectionId
            : "/settings/agent-policy"
        }
        w="fit-content"
      >
        {connectionId ? "返回连接详情" : "返回策略"}
      </Button>
      <SettingsTitle title={connectionId ? "连接活动" : "Agent 审计"} />
      <Group>
        <Select
          label="操作状态"
          clearable
          value={status || null}
          data={[
            "committed",
            "rejected",
            "running",
            "pending",
            "recovering",
          ].map((value) => ({ value, label: statusLabels[value] }))}
          onChange={(v) => setParams(v ? { status: v } : {})}
        />
        <Button variant="default" onClick={refresh}>
          刷新
        </Button>
      </Group>
      <AgentState
        loading={loading}
        error={allowed ? error : 403}
        retry={refresh}
      >
        {!data?.items.length ? (
          <Text c="dimmed">暂无活动记录</Text>
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>应用</Table.Th>
                  <Table.Th>授权用户</Table.Th>
                  <Table.Th>文档</Table.Th>
                  <Table.Th>操作</Table.Th>
                  <Table.Th>结果</Table.Th>
                  <Table.Th>时间</Table.Th>
                  <Table.Th>版本变化</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.application}</Table.Td>
                    <Table.Td>{item.actorName}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" title={item.pageId}>
                        {item.pageId.slice(0, 8)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{toolLabels[item.tool]}</Table.Td>
                    <Table.Td>{statusLabels[item.status]}</Table.Td>
                    <Table.Td>
                      {new Date(item.createdAt).toLocaleString()}
                    </Table.Td>
                    <Table.Td>
                      {item.beforeRevision ?? "—"} → {item.afterRevision ?? "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <AgentPager
          cursor={cursor}
          next={data?.next_cursor}
          setCursor={(v) =>
            setParams({
              ...(status ? { status } : {}),
              ...(v ? { cursor: v } : {}),
            })
          }
        />
      </AgentState>
    </Stack>
  );
}
