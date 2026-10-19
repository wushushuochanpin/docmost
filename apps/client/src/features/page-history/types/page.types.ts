interface IPageHistoryUser {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface IPageHistory {
  agentSource?: {operationId:string;side:"before"|"after";application:string};
  id: string;
  pageId: string;
  title: string;
  content?: any;
  slug: string;
  icon: string;
  coverPhoto: string;
  themeColor?: string;
  themePattern?: string;
  version: number;
  lastUpdatedById: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: IPageHistoryUser;
  contributors?: IPageHistoryUser[];
}
