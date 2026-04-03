import { Group, Skeleton } from '@mantine/core';

export default function PageListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Group key={i} gap="sm" px="xs" py="sm" style={{ borderRadius: 8 }}>
          <Skeleton width={18} height={18} radius="xl" />
          <Skeleton height={16} width="45%" radius="sm" style={{ flex: 1 }} />
          <Skeleton height={14} width={72} radius="sm" />
        </Group>
      ))}
    </div>
  );
}
