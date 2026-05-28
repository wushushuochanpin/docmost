import type { IPage } from "@/features/page/types/page.types";
import type { PageNodeType } from "@/features/page/tree/types";

export type CreateTreeNodeOptions = {
  nodeType?: PageNodeType;
};

export type TreeCreatePayload = Partial<IPage> & {
  spaceId: string;
  nodeType: PageNodeType;
  parentPageId?: string;
};

export function buildTreeCreatePayload(
  spaceId: string,
  parentId: string | null,
  options?: CreateTreeNodeOptions,
): TreeCreatePayload {
  const nodeType = options?.nodeType ?? (parentId ? "file" : "folder");
  const payload: TreeCreatePayload = { spaceId, nodeType };

  if (parentId) {
    payload.parentPageId = parentId;
  }

  return payload;
}
