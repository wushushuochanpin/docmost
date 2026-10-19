import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Container,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";

type Consent = {
  id: string;
  application: string;
  redirect_origin: string;
  scopes: string[];
  max_grant_days?: number;
  spaces: { id: string; name: string }[];
  expires_at: string;
  consumed: boolean;
  csrf_token: string;
};
const scopeLabels: Record<string, string> = {
  "knowledge.read": "读取文档",
  "pages.create": "新建文档",
  "folders.create": "新建文件夹",
  "pages.edit": "编辑文档",
};
export default function AgentConsentPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const requestId = params.get("request_id") ?? "";
  const identity = useAtomValue(currentUserAtom);
  const generation = useRef(0);
  const submitting = useRef(false);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>(["knowledge.read"]);
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    setConsent(null);
    setError(false);
    setSpaces([]);
    setScopes(["knowledge.read"]);
    setBusy(false);
    submitting.current = false;
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      setError(true);
      return;
    }
    api
      .get<Consent>(`/agent-oauth/requests/${requestId}`, {
        signal: abort.signal,
      })
      .then(({ data }) => {
        if (generation.current === current) {
          setConsent(data);
          setDuration(
            String(
              [1, 7, 30, 90]
                .filter((n) => n <= Math.min(30, data.max_grant_days ?? 30))
                .at(-1) ?? 1,
            ),
          );
        }
      })
      .catch(() => {
        if (!abort.signal.aborted && generation.current === current)
          setError(true);
      });
    return () => {
      ++generation.current;
      abort.abort();
    };
  }, [requestId, identity?.user?.id, retry]);
  async function decide(decision: "allow" | "deny") {
    if (!consent || submitting.current) return;
    const current = generation.current;
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      const { data } = await api.post<{ redirect_url: string }>(
        `/agent-oauth/requests/${requestId}/decision`,
        {
          decision,
          space_ids: spaces,
          scopes,
          duration_days: Number(duration),
        },
        { headers: { "X-CSRF-Token": consent.csrf_token } },
      );
      if (current !== generation.current) return;
      const destination = new URL(data.redirect_url);
      if (destination.origin !== consent.redirect_origin)
        throw new Error("Unexpected callback");
      window.location.assign(destination.href);
    } catch {
      if (current === generation.current) {
        setError(true);
        setBusy(false);
        submitting.current = false;
      }
    }
  }
  return (
    <Container size={560} py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack>
          <Title order={1} size="h2">
            {t("允许应用访问你的文档？")}
          </Title>
          {error && (
            <Alert color="red" role="alert">
              {t(
                "无法完成连接，请重试。请求可能已过期，请返回应用重新发起连接。",
              )}
            </Alert>
          )}
          {!consent && !error && <Loader aria-label={t("加载中")} />}
          {!consent && error && (
            <Button onClick={() => setRetry((x) => x + 1)}>{t("重试")}</Button>
          )}
          {consent && (
            <>
              <Text fw={600}>{consent.application}</Text>
              <Text size="sm">
                {t("只允许访问你选择的空间，且不能超出你的当前权限。")}
              </Text>
              <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                {t("返回地址")}: {consent.redirect_origin}
              </Text>
              <Checkbox.Group
                label={t("访问权限")}
                value={scopes}
                onChange={setScopes}
              >
                <Stack gap="xs" mt="xs">
                  {consent.scopes.map((scope) => (
                    <Checkbox
                      key={scope}
                      value={scope}
                      label={t(scopeLabels[scope] ?? scope)}
                      disabled={busy || scope === "knowledge.read"}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
              <Checkbox.Group
                label={t("允许访问的空间")}
                value={spaces}
                onChange={setSpaces}
              >
                <Stack gap="xs" mt="xs">
                  {consent.spaces.map((space) => (
                    <Checkbox
                      key={space.id}
                      value={space.id}
                      label={space.name}
                      disabled={busy}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
              {!consent.spaces.length && (
                <Text size="sm">
                  {t("没有可授权的空间，请联系工作区管理员。")}
                </Text>
              )}
              <Select
                label={t("有效期")}
                value={duration}
                onChange={(value) => setDuration(value ?? "30")}
                data={[1, 7, 30, 90]
                  .filter((n) => n <= (consent.max_grant_days ?? 30))
                  .map((days) => ({
                    value: String(days),
                    label: `${days} ${t("天")}`,
                  }))}
                disabled={busy}
                allowDeselect={false}
              />
              {!spaces.length && (
                <Text size="sm" c="dimmed">
                  {t("请选择至少一个空间")}
                </Text>
              )}
              <Group>
                <Button
                  loading={busy}
                  disabled={!spaces.length}
                  onClick={() => void decide("allow")}
                >
                  {t("允许连接")}
                </Button>
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => void decide("deny")}
                >
                  {t("拒绝")}
                </Button>
              </Group>
            </>
          )}
          <Button variant="subtle" component={Link} to="/home">
            {t("返回首页")}
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
