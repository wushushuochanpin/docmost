import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { Link } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import useUserRole from "@/hooks/use-user-role";
import { api, Policy, quotaLabels, useAgentData } from "./api";
import { AgentState, MutationMessage } from "./shared";
export default function AgentPolicyPage() {
  const { isAdmin } = useUserRole(),
    { data, error, loading, refresh, generation } = useAgentData<Policy>(
      isAdmin ? "/agent-policy" : null,
    );
  const [draft, setDraft] = useState<Policy>(),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    setDraft(data);
    setBusy(false);
    submitting.current = false;
  }, [data]);
  async function save() {
    if (!draft || !data || submitting.current) return;
    const current = generation.current;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      await api.put(
        "/agent-policy",
        {
          expected_version: data.version,
          enabled: draft.enabled,
          max_grant_days: draft.maxGrantDays,
          quota_limits: draft.quotaLimits,
          timezone: draft.timezone,
        },
        { headers: { "X-CSRF-Token": data.csrf_token } },
      );
      if (current === generation.current) {
        setMessage("策略已保存");
        setConfirm(false);
        refresh();
      }
    } catch (e: any) {
      if (current === generation.current)
        setMessage(
          e.response?.status === 409
            ? "策略已变化，请重新加载后再操作。"
            : "结果待确认，请重新加载核对策略。",
        );
    } finally {
      if (current === generation.current) {
        setBusy(false);
        submitting.current = false;
      }
    }
  }
  if (!isAdmin)
    return (
      <Stack>
        <Alert color="red">你没有管理 Agent 策略的权限。</Alert>
        <Button
          component={Link}
          to="/settings/account/profile"
          variant="default"
        >
          返回设置
        </Button>
      </Stack>
    );
  return (
    <Stack>
      <SettingsTitle title="Agent 策略" />
      <MutationMessage message={message} />
      <AgentState loading={loading} error={error} retry={refresh}>
        {draft && (
          <>
            <Switch
              label="允许 Agent 写入"
              checked={draft.enabled}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.currentTarget.checked })
              }
            />
            <NumberInput
              label="授权有效期上限（天）"
              value={draft.maxGrantDays}
              min={1}
              max={90}
              allowDecimal={false}
              disabled={busy}
              onChange={(v) => setDraft({ ...draft, maxGrantDays: Number(v) })}
            />
            <TextInput
              label="每日额度时区"
              description="变更时区不会重置当前周期，下一周期生效。"
              value={draft.timezone}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, timezone: e.currentTarget.value })
              }
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {Object.entries(draft.quotaLimits).map(([key, value]) => (
                <NumberInput
                  key={key}
                  label={quotaLabels[key]}
                  value={value}
                  min={1}
                  max={data?.hard_limits[key]}
                  allowDecimal={false}
                  disabled={busy}
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      quotaLimits: { ...draft.quotaLimits, [key]: Number(v) },
                    })
                  }
                />
              ))}
            </SimpleGrid>
            <Group>
              <Button
                loading={busy}
                disabled={
                  !draft.timezone ||
                  draft.maxGrantDays < 1 ||
                  Object.values(draft.quotaLimits).some((v) => v < 1)
                }
                onClick={() =>
                  data?.enabled && !draft.enabled ? setConfirm(true) : save()
                }
              >
                保存策略
              </Button>
              <Button variant="default" disabled={busy} onClick={refresh}>
                重新加载
              </Button>
              <Button
                variant="subtle"
                component={Link}
                to="/settings/agent-audit"
              >
                查看审计
              </Button>
            </Group>
            <Modal
              opened={confirm}
              onClose={() => !busy && setConfirm(false)}
              title="关闭 Agent 写入？"
              centered
            >
              <Alert>
                新的写入将被拒绝。已保存内容和读取权限保留，在途操作以最终提交结果为准。
              </Alert>
              <Group mt="md">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  取消
                </Button>
                <Button color="red" loading={busy} onClick={save}>
                  确认关闭
                </Button>
              </Group>
            </Modal>
          </>
        )}
      </AgentState>
    </Stack>
  );
}
