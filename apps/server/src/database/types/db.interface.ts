import {
  ApiKeys,
  Attachments,
  AuthAccounts,
  AuthProviders,
  Backlinks,
  BackupJobs,
  BackupPolicies,
  BackupRestores,
  Billing,
  Comments,
  FileTasks,
  FolderMigrationJobItems,
  FolderMigrationJobs,
  Groups,
  GroupUsers,
  PageHistory,
  PageNodeMeta,
  Pages,
  Shares,
  SpaceMembers,
  Spaces,
  UserMfa,
  Users,
  UserTokens,
  WorkspaceInvitations,
  WorkspaceReleaseChannel,
  Workspaces,
} from '@docmost/db/types/db';
import { PageEmbeddings } from '@docmost/db/types/embeddings.types';

export interface DbInterface {
  attachments: Attachments;
  backupJobs: BackupJobs;
  backupPolicies: BackupPolicies;
  backupRestores: BackupRestores;
  authAccounts: AuthAccounts;
  authProviders: AuthProviders;
  backlinks: Backlinks;
  billing: Billing;
  comments: Comments;
  fileTasks: FileTasks;
  folderMigrationJobItems: FolderMigrationJobItems;
  folderMigrationJobs: FolderMigrationJobs;
  groups: Groups;
  groupUsers: GroupUsers;
  pageEmbeddings: PageEmbeddings;
  pageHistory: PageHistory;
  pageNodeMeta: PageNodeMeta;
  pages: Pages;
  shares: Shares;
  spaceMembers: SpaceMembers;
  spaces: Spaces;
  userMfa: UserMfa;
  users: Users;
  userTokens: UserTokens;
  workspaceInvitations: WorkspaceInvitations;
  workspaceReleaseChannel: WorkspaceReleaseChannel;
  workspaces: Workspaces;
  apiKeys: ApiKeys;
}
