import { Badge, Button, Loader, ScrollArea, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { formattedDate } from "@/lib/time.ts";
import { IApiKey } from "../types/api-key.types.ts";

interface ApiKeyTableProps {
  items?: IApiKey[];
  loading?: boolean;
  showCreator?: boolean;
  showOwner?: boolean;
  onRevoke: (token: IApiKey) => void;
}

function formatDate(date?: string | null) {
  if (!date) {
    return "—";
  }

  return formattedDate(new Date(date));
}

function getStatusColor(status: string) {
  return status === "active" ? "green" : "gray";
}

function getDisplayName(name?: string | null, email?: string | null) {
  return name || email || "—";
}

export default function ApiKeyTable({
  items,
  loading,
  showCreator,
  showOwner,
  onRevoke,
}: ApiKeyTableProps) {
  const { t } = useTranslation();

  const columns =
    6 + (showCreator ? 1 : 0) + (showOwner ? 1 : 0) + 1;

  return (
    <ScrollArea>
      <Table highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Name")}</Table.Th>
            <Table.Th>{t("Prefix")}</Table.Th>
            <Table.Th>{t("Status")}</Table.Th>
            {showCreator && <Table.Th>{t("Creator")}</Table.Th>}
            {showOwner && <Table.Th>{t("Owner")}</Table.Th>}
            <Table.Th>{t("Last used")}</Table.Th>
            <Table.Th>{t("Expiration")}</Table.Th>
            <Table.Th>{t("Created")}</Table.Th>
            <Table.Th>{t("Actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={columns}>
                <Loader size="sm" mx="auto" />
              </Table.Td>
            </Table.Tr>
          ) : !items?.length ? (
            <NoTableResults colSpan={columns} text={t("No API keys found")} />
          ) : (
            items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Text fw={500}>{item.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Text ff="monospace">{item.tokenPrefix}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(item.status)} variant="light">
                    {item.status === "active" ? t("Active") : t("Revoked")}
                  </Badge>
                </Table.Td>
                {showCreator && (
                  <Table.Td>
                    {getDisplayName(item.creatorName, item.creatorEmail)}
                  </Table.Td>
                )}
                {showOwner && (
                  <Table.Td>
                    {getDisplayName(item.ownerName, item.ownerEmail)}
                  </Table.Td>
                )}
                <Table.Td>{formatDate(item.lastUsedAt)}</Table.Td>
                <Table.Td>{formatDate(item.expiresAt)}</Table.Td>
                <Table.Td>{formatDate(item.createdAt)}</Table.Td>
                <Table.Td>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    color="red"
                    disabled={item.status !== "active"}
                    onClick={() => onRevoke(item)}
                  >
                    {t("Revoke")}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
