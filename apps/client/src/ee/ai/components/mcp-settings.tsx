import {
  Anchor,
  Group,
  List,
  Text,
  Switch,
  TextInput,
  ActionIcon,
  Tooltip,
  Stack,
  Alert,
  Button,
  Badge,
} from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAgentData } from "@/features/agent-connections/api";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl } from "@/lib/config.ts";
import { Check, Copy } from "lucide-react";
import { CopyButton } from "@/components/common/copy-button.tsx";

export default function McpSettings() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const checked = workspace?.settings?.ai?.mcp === true;
  const [saving, setSaving] = useState(false);
  const {
    data: capabilities,
    error,
    loading,
    refresh,
  } = useAgentData<{
    oauth_enabled: boolean;
    document_commands_enabled: boolean;
  }>("/agent-capabilities");

  const mcpUrl = `${getAppUrl()}/mcp`;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    if (saving) return;
    setSaving(true);
    try {
      const updatedWorkspace = await updateWorkspace({ mcpEnabled: value });
      setWorkspace(updatedWorkspace);
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">Xenzify MCP</Text>
          <Text size="sm" c="dimmed">
            连接 AI 助手，搜索、读取或在授权范围内创建和编辑工作区文档。
            本实例使用自研 MCP 服务。
            <Anchor
              href="https://github.com/wushushuochanpin/docmost/blob/main/docs/iterations/20261018_01_agent-document-mcp/public/developer-guide.md"
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              查看接入文档
            </Anchor>
          </Text>
        </div>

        <Switch
          aria-label="启用 Xenzify MCP"
          checked={checked}
          disabled={saving}
          onChange={handleChange}
        />
      </Group>

      {checked && (
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("MCP Server URL")}
          </Text>
          <Group gap="xs">
            <TextInput
              aria-label="MCP 服务器 URL"
              value={mcpUrl}
              readOnly
              style={{ flex: 1 }}
            />
            <CopyButton value={mcpUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip
                  label={copied ? t("Copied") : t("Copy")}
                  withArrow
                  position="right"
                >
                  <ActionIcon
                    aria-label="复制 MCP 服务器 URL"
                    color={copied ? "teal" : "gray"}
                    variant="subtle"
                    onClick={copy}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Stack gap="md" mt="lg">
            <div>
              <Text fw={500}>OAuth 授权读写</Text>
              <Text size="sm" c="dimmed" mt={4}>
                由管理员登记客户端，再从 AI
                助手发起连接。在授权页选择空间、读取或写入权限及有效期。
                新建和编辑还需在「Agent 策略」中允许写入。
              </Text>
              <Group mt="sm" gap="xs">
                <Badge color={capabilities?.oauth_enabled ? "teal" : "gray"}>
                  {loading
                    ? "正在检查授权服务"
                    : error !== undefined
                      ? "授权服务状态未知"
                      : capabilities?.oauth_enabled
                        ? "授权服务已启用"
                        : "授权服务未启用"}
                </Badge>
                <Badge
                  color={
                    capabilities?.document_commands_enabled ? "teal" : "gray"
                  }
                >
                  {loading
                    ? "正在检查写入服务"
                    : error !== undefined
                      ? "写入服务状态未知"
                      : capabilities?.document_commands_enabled
                        ? "写入服务已启用"
                        : "写入服务未启用"}
                </Badge>
                <Button variant="subtle" size="compact-sm" onClick={refresh}>
                  刷新状态
                </Button>
              </Group>
              {error !== undefined && (
                <Alert color="yellow" mt="sm">
                  无法读取服务状态，请重试。MCP 总开关不代表 OAuth 写入已就绪。
                </Alert>
              )}
              {capabilities &&
                (!capabilities.oauth_enabled ||
                  !capabilities.document_commands_enabled) && (
                  <Alert color="yellow" mt="sm">
                    请联系实例管理员完成授权和写入服务配置。仅打开本页开关不会启用这些服务。
                  </Alert>
                )}
              <Group mt="sm">
                <Button
                  component={Link}
                  to="/settings/account/agent-connections"
                  variant="light"
                  size="xs"
                >
                  管理我的 Agent 连接
                </Button>
                <Button
                  component={Link}
                  to="/settings/agent-policy"
                  variant="default"
                  size="xs"
                >
                  管理 Agent 写入策略
                </Button>
              </Group>
            </div>
            <div>
              <Text fw={500}>API 密钥只读访问</Text>
              <Text size="sm" c="dimmed" mt={4}>
                已有 API 密钥可继续用于搜索和读取，不能用于创建或编辑文档。
              </Text>
              <Text size="sm" mt={4}>
                search · get_page · fetch · list_pages
              </Text>
            </div>
            <div>
              <Text fw={500}>OAuth 工具</Text>
              <List size="sm" spacing={4} mt={4}>
                <List.Item>
                  浏览与读取：search、get_page、fetch、list_pages、list_spaces
                </List.Item>
                <List.Item>新建：create_folder、create_page</List.Item>
                <List.Item>
                  编辑：get_edit_context、edit_page、update_page_metadata
                </List.Item>
                <List.Item>图片与 GIF 附件：upload_image</List.Item>
                <List.Item>结果查询：get_operation</List.Item>
              </List>
              <Text size="sm" c="dimmed" mt="xs">
                支持原生表格、图片/GIF、可编辑图注、分割线和 Mermaid
                图表。图片需先上传为文档附件；超出支持范围的内容会明确拒绝。
                实际可用工具取决于本次授权。文档创建在文件夹内；可在「我的 Agent
                连接」中缩小权限或撤销连接。
              </Text>
            </div>
          </Stack>
        </div>
      )}
    </Stack>
  );
}
