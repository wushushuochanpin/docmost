export interface ISidebarCategory {
  id: string;
  name: string;
  sortKey: string;
  spaceId: string;
  workspaceId: string;
  createdBy?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ICreateSidebarCategoryInput {
  spaceId: string;
  name: string;
}

export interface IUpdateSidebarCategoryInput {
  categoryId: string;
  name: string;
}

export interface IDeleteSidebarCategoryInput {
  categoryId: string;
}

export interface IDeleteSidebarCategoryResult {
  categoryId: string;
  unassignedRootCount: number;
}

export interface IReorderSidebarCategoriesInput {
  spaceId: string;
  orderedCategoryIds: string[];
}
