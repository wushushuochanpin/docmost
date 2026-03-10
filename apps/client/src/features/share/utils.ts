import { IPage } from "@/features/page/types/page.types.ts";
import { sortPositionKeys } from "@/features/page/tree/utils";

export type SharedPageTreeNode = {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  nodeType?: "file" | "folder";
  position: string;
  spaceId: string;
  parentPageId: string;
  hasChildren: boolean;
  children: SharedPageTreeNode[];
  label: string;
  value: string;
};

export function buildSharedPageTree(
  pages: Partial<IPage>[] | undefined | null,
): SharedPageTreeNode[] {
  if (!Array.isArray(pages) || pages.length === 0) {
    return [];
  }

  const pageMap: Record<string, SharedPageTreeNode> = {};

  // Only include pages with both id and slugId so map keys and node identity are reliable.
  const validPages = pages.filter(
    (p): p is Partial<IPage> & { id: string; slugId: string } =>
      Boolean(p && typeof p.id === "string" && typeof p.slugId === "string"),
  );

  validPages.forEach((page) => {
    pageMap[page.id] = {
      id: page.slugId,
      slugId: page.slugId,
      name: page.title,
      icon: page.icon,
      nodeType: page.nodeType,
      position: page.position,
      hasChildren: false,
      spaceId: page.spaceId,
      parentPageId: page.parentPageId,
      label: page.title || "untitled",
      value: page.id,
      children: [],
    };
  });

  const tree: SharedPageTreeNode[] = [];
  validPages.forEach((page) => {
    const node = pageMap[page.id];
    if (!node) return;

    if (page.parentPageId) {
      const parentNode = pageMap[page.parentPageId];
      if (parentNode) {
        parentNode.children.push(node);
        parentNode.hasChildren = true;
      } else {
        tree.push(node);
      }
    } else {
      tree.push(node);
    }
  });

  function sortTree(nodes: SharedPageTreeNode[]): SharedPageTreeNode[] {
    return sortPositionKeys(nodes).map((node: SharedPageTreeNode) => ({
      ...node,
      children: sortTree(node.children),
    }));
  }

  return sortTree(tree);
}

/**
 * Find direct children of the page in the shared tree.
 * pageId can be the page's UUID (node.value) or slugId (node.slugId / node.id).
 */
export function findSharedPageSubpages(
  tree: SharedPageTreeNode[] | null | undefined,
  pageId: string | undefined,
): SharedPageTreeNode[] {
  if (!tree?.length || !pageId) {
    return [];
  }

  function visit(nodes: SharedPageTreeNode[]): SharedPageTreeNode[] | null {
    for (const node of nodes) {
      if (
        node.value === pageId ||
        node.slugId === pageId ||
        node.id === pageId
      ) {
        return node.children ?? [];
      }

      if (node.children?.length) {
        const subpages = visit(node.children);
        if (subpages) return subpages;
      }
    }
    return null;
  }

  return visit(tree) ?? [];
}

// Recursively checks if a page exists in the shared page tree.
export function isPageInTree(
  tree: SharedPageTreeNode[],
  pageSlugId: string,
): boolean {
  for (const node of tree) {
    if (node.slugId === pageSlugId) {
      return true;
    }
    if (isPageInTree(node.children, pageSlugId)) {
      return true;
    }
  }
  return false;
}
