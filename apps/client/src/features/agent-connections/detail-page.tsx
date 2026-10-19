import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import {
  api,
  Connection,
  scopeLabels,
  statusLabels,
  useAgentData,
} from "./api";
import { AgentState, connectionPath, MutationMessage } from "./shared";
export default function ConnectionDetail() {
  const { connectionId } = useParams(),
    remote = useAgentData<Connection>("/agent-connections/" + connectionId);
  const { data, error, loading, refresh, generation } = remote;
  const [scopes, setScopes] = useState<string[]>([]),
    [spaces, setSpaces] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    setScopes(data?.scopes ?? []);
    setSpaces(data?.spaceIds ?? []);
    setConfirm(false);
    setBusy(false);
    submitting.current = false;
  }, [data]);
  async function save(revoke = false) {
    if (!data || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    const current = generation.current;
    try {
      const config = { headers: { "X-CSRF-Token": data.csrf_token } };
      if (revoke)
        await api.post(
          "/agent-connections/" + data.id + "/revoke",
          { expected_version: data.version },
          config,
        );
      else
        await api.patch(
          "/agent-connections/" + data.id,
          { expected_version: data.version, scopes, space_ids: spaces },
          config,
        );
      if (current !== generation.current) return;
      setConfirm(false);
      setMessage(revoke ? "连接已撤销" : "访问范围已更新");
      refresh();
    } catch (e: any) {
      if (current === generation.current) {
        setConfirm(false);
        setMessage(
          e.response?.status === 409
            ? "连接已变化，请重新加载后再操作。"
            : "结果待确认。请重新加载核对当前范围，再决定是否重试。",
        );
      }
    } finally {
      if (current === generation.current) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }
  const active = data?.status === "active";
  return (
    <Stack>
      <Button
        variant="subtle"
        component={Link}
        to={connectionPath}
        w="fit-content"
      >
        返回连接列表
      </Button>
      <SettingsTitle title={data?.name ?? "连接详情"} />
      <MutationMessage message={message} />
      <AgentState loading={loading} error={error} retry={refresh}>
        {data && (
          <>
            <Text>
              {statusLabels[data.status]} · 到期：
              {new Date(data.expiresAt).toLocaleString()}
            </Text>
            <Text size="sm" c="dimmed">
              最近使用：
              {data.lastUsedAt
                ? new Date(data.lastUsedAt).toLocaleString()
                : "暂无"}
            </Text>
            {!active && (
              <Alert>
                此连接不可修改。需要继续使用时，请从 Agent 重新授权。
              </Alert>
            )}
            <Checkbox.Group
              label="访问权限"
              value={scopes}
              onChange={setScopes}
            >
              <Stack mt="xs">
                {data.scopes.map((scope) => (
                  <Checkbox
                    key={scope}
                    value={scope}
                    label={scopeLabels[scope]}
                    disabled={!active || busy || scope === "knowledge.read"}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
            <Checkbox.Group
              label="可访问空间"
              value={spaces}
              onChange={setSpaces}
            >
              <Stack mt="xs">
                {data.spaces.map((space) => (
                  <Checkbox
                    key={space.id}
                    value={space.id}
                    label={space.name}
                    disabled={!active || busy}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
            <Text size="sm" c="dimmed">
              只能缩小范围。增加权限、空间或延长有效期，需要重新授权。
            </Text>
            <Group>
              <Button
                onClick={() => save()}
                loading={busy}
                disabled={!active || !spaces.length || !scopes.length}
              >
                保存访问范围
              </Button>
              <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                  setSpaces(data.spaceIds);
                  setScopes(data.scopes);
                }}
              >
                取消修改
              </Button>
              <Button
                variant="light"
                color="red"
                disabled={!active || busy}
                onClick={() => setConfirm(true)}
              >
                撤销连接
              </Button>
              <Button variant="default" onClick={refresh} disabled={busy}>
                重新加载
              </Button>
            </Group>
            <Button
              component={Link}
              variant="subtle"
              to={connectionPath + "/" + data.id + "/activity"}
              w="fit-content"
            >
              查看活动
            </Button>
            <Modal
              opened={confirm}
              onClose={() => !busy && setConfirm(false)}
              title={"撤销 " + data.name + " 的连接？"}
              centered
              closeOnClickOutside={!busy}
              closeOnEscape={!busy}
            >
              <Text>撤销后该应用不能继续访问文档。已经保存的修改会保留。</Text>
              <Group mt="md" justify="flex-end">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  取消
                </Button>
                <Button color="red" loading={busy} onClick={() => save(true)}>
                  确认撤销
                </Button>
              </Group>
            </Modal>
          </>
        )}
      </AgentState>
    </Stack>
  );
}
