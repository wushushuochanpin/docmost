import { PageNodeType } from '@docmost/db/repos/page/page-node-meta.repo';

/**
 * Type labels used in the auto-generated default title of newly created pages
 * when the client does not provide one, e.g. `2026.9.26.1 ·新文件夹`.
 *
 * The server has no i18n layer for stored content, so these are plain strings.
 * Adjust this map if you need to localize default page naming.
 */
export const DEFAULT_PAGE_TITLE_LABELS: Record<PageNodeType, string> = {
  folder: '新文件夹',
  file: '新文件',
};
