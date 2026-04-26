import { ScApiToken, User, Workspace } from '@docmost/db/types/entity.types';

export type McpToolContext = {
  user: User;
  workspace: Workspace;
  baseUrl: string;
  apiToken?: ScApiToken;
};

export type ImageReturnMode = 'none' | 'metadata' | 'url' | 'inline';

export type FetchMode = 'snippet' | 'section' | 'full';

export type McpSearchInput = {
  query: string;
  space_id?: string;
  parent_page_id?: string;
  include_children?: boolean;
  max_depth?: number;
  top_k?: number;
  source_types?: string[];
};

export type McpFetchInput = {
  id: string;
  format?: 'markdown' | 'html';
  mode?: FetchMode;
  max_tokens?: number;
  include_images?: ImageReturnMode;
  include_children?: boolean;
  max_depth?: number;
};

export type McpAttachmentResult = {
  id: string;
  name: string;
  mime_type: string;
  file_size: number | null;
  url?: string;
  inline?: boolean;
  inline_omitted_reason?: string;
};
