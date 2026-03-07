import { IPage } from "@/features/page/types/page.types.ts";

export type ShareAccessMode = "public" | "password_expiring";

export interface IShare {
  id: string;
  key: string;
  pageId: string;
  accessMode: ShareAccessMode;
  expiresAt: string | null;
  securityVersion: number;
  includeSubPages: boolean;
  searchIndexing: boolean;
  creatorId: string;
  spaceId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  generatedPassword?: string | null;
  sharedPage?: ISharePage;
}

export interface ISharedItem extends IShare {
  page: {
    id: string;
    title: string;
    slugId: string;
    icon: string | null;
  };
  space: {
    id: string;
    name: string;
    slug: string;
    userRole: string;
  };
  creator: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface ISharedPage extends IShare {
  page: IPage;
  share: IShare & {
    level: number;
    sharedPage: { id: string; slugId: string; title: string; icon: string };
  };
  hasLicenseKey: boolean;
  rendered?: ISharedPageRendered | null;
}

export interface IShareForPage extends IShare {
  level: number;
  sharedPage: ISharePage;
}

interface ISharePage {
  id: string;
  slugId: string;
  title: string;
  icon: string;
}

export interface ICreateShare {
  pageId?: string;
  includeSubPages?: boolean;
  searchIndexing?: boolean;
  accessMode?: ShareAccessMode;
  expiresInMinutes?: number;
}

export type IUpdateShare = ICreateShare & { shareId: string; pageId?: string };

export interface IShareInfoInput {
  pageId: string;
  shareId?: string;
  accessToken?: string;
}

export interface IVerifyShareAccessInput {
  shareId: string;
  password: string;
}

export interface IVerifyShareAccessOutput {
  accessToken: string;
  expiresAt: string;
}

export interface IReshareShareInput {
  shareId: string;
  accessMode: ShareAccessMode;
  includeSubPages?: boolean;
  searchIndexing?: boolean;
  keepLink?: boolean;
  expiresInMinutes?: number;
}

export interface ISharedPageTree {
  share: IShare;
  pageTree: Partial<IPage[]>;
  hasLicenseKey: boolean;
}

export interface ISharedPageRendered {
  html: string;
  generatedAt: string;
  contentHash: string;
  rendererVersion: string;
  legacyFallbackReason?: string | null;
  toc: ISharedPageRenderedTocItem[];
  interactiveBlocks: ISharedPageRenderedBlock[];
}

export interface ISharedPageRenderedTocItem {
  id: string;
  text: string;
  level: number;
}

export interface ISharedPageRenderedBlock {
  id: string;
  type: "drawio" | "excalidraw" | "embed";
}
