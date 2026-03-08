import { Badge, Code, Loader, ScrollArea, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { formattedDate } from "@/lib/time.ts";
import { IAuditLog } from "../types/audit.types.ts";

interface AuditLogTableProps {
  items?: IAuditLog[];
  loading?: boolean;
}

function humanize(value: string) {
  return value
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactJson(value: unknown) {
  if (!value) return null;

  const serialized = JSON.stringify(value);
  if (!serialized || serialized === "{}" || serialized === "[]") {
    return null;
  }

  return serialized.length > 180
    ? `${serialized.slice(0, 177)}...`
    : serialized;
}

function actorLabel(item: IAuditLog) {
  if (item.actorName || item.actorEmail) {
    return item.actorName || item.actorEmail || "—";
  }

  if (item.actorType === "system") {
    return "System";
  }

  if (item.actorType === "api_key") {
    return "API Key";
  }

  return "—";
}

export default function AuditLogTable({
  items,
  loading,
}: AuditLogTableProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea>
      <Table highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Actor")}</Table.Th>
            <Table.Th>{t("Event")}</Table.Th>
            <Table.Th>{t("Resource")}</Table.Th>
            <Table.Th>{t("Details")}</Table.Th>
            <Table.Th>{t("When")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Loader size="sm" mx="auto" />
              </Table.Td>
            </Table.Tr>
          ) : !items?.length ? (
            <NoTableResults colSpan={5} text={t("No audit events yet")} />
          ) : (
            items.map((item) => {
              const changes = compactJson(item.changes);
              const metadata = compactJson(item.metadata);

              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={500}>{actorLabel(item)}</Text>
                    {item.actorEmail && (
                      <Text size="xs" c="dimmed">
                        {item.actorEmail}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{humanize(item.event)}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>{humanize(item.resourceType)}</Text>
                    {item.resourceId && (
                      <Text size="xs" c="dimmed">
                        {item.resourceId}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td maw={380}>
                    {item.ipAddress && (
                      <Text size="xs" c="dimmed">
                        IP: {item.ipAddress}
                      </Text>
                    )}
                    {item.userAgent && (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {item.userAgent}
                      </Text>
                    )}
                    {changes && (
                      <Code block mt={6}>
                        {changes}
                      </Code>
                    )}
                    {!changes && metadata && (
                      <Code block mt={6}>
                        {metadata}
                      </Code>
                    )}
                  </Table.Td>
                  <Table.Td>{formattedDate(new Date(item.createdAt))}</Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
