import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { ReactNode } from "react";
export const connectionPath = "/settings/account/agent-connections";
export function AgentState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: number;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading) return <Loader aria-label="正在加载" />;
  if (error !== undefined)
    return (
      <Stack>
        <Alert color="red">
          {error === 403 || error === 404
            ? "无法访问此页面，请返回设置。"
            : "加载失败，请检查网络后重试。"}
        </Alert>
        <Group>
          <Button variant="default" onClick={retry}>
            重新加载
          </Button>
          <Button
            component={Link}
            to="/settings/account/profile"
            variant="subtle"
          >
            返回设置
          </Button>
        </Group>
      </Stack>
    );
  return <>{children}</>;
}
export function AgentPager({
  next,
  cursor,
  setCursor,
}: {
  next?: string | null;
  cursor: string;
  setCursor: (cursor: string) => void;
}) {
  return (
    <Group>
      <Button
        variant="default"
        disabled={!cursor}
        onClick={() => setCursor("")}
      >
        首页
      </Button>
      <Button
        variant="default"
        disabled={!next}
        onClick={() => next && setCursor(next)}
      >
        下一页
      </Button>
    </Group>
  );
}
export function MutationMessage({ message }: { message: string }) {
  return message ? (
    <Text role="status" size="sm">
      {message}
    </Text>
  ) : null;
}
