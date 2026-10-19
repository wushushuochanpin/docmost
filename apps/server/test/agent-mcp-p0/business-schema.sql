-- Minimal fixtures of the real tables referenced by production ACL repositories.
CREATE TABLE workspaces(id uuid PRIMARY KEY);
CREATE TABLE users(role text NOT NULL DEFAULT 'member',id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),deleted_at timestamptz,deactivated_at timestamptz);
CREATE TABLE spaces(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id));
CREATE TABLE groups(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id));
CREATE TABLE group_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid REFERENCES groups(id),user_id uuid REFERENCES users(id));
CREATE TABLE space_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),space_id uuid REFERENCES spaces(id),user_id uuid REFERENCES users(id),group_id uuid REFERENCES groups(id),role text NOT NULL);
CREATE TABLE pages(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),space_id uuid NOT NULL REFERENCES spaces(id),parent_page_id uuid REFERENCES pages(id),title text,ydoc bytea,content jsonb,text_content text,deleted_at timestamptz,last_updated_by_id uuid,updated_at timestamptz,creator_id uuid,slug_id text,icon text,cover_photo text,theme_color text,theme_pattern text,contributor_ids uuid[]);
CREATE TABLE page_access(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_id uuid REFERENCES pages(id),workspace_id uuid NOT NULL,access_level text DEFAULT 'restricted');
CREATE TABLE page_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_access_id uuid REFERENCES page_access(id),user_id uuid REFERENCES users(id),group_id uuid REFERENCES groups(id),role text NOT NULL);
CREATE TABLE user_sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),workspace_id uuid NOT NULL,revoked_at timestamptz,expires_at timestamptz);
CREATE TABLE page_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_id uuid REFERENCES pages(id),workspace_id uuid,space_id uuid,slug_id text,title text,content jsonb,icon text,cover_photo text,theme_color text,theme_pattern text,last_updated_by_id uuid,contributor_ids uuid[],created_at timestamptz DEFAULT clock_timestamp());

CREATE TABLE page_node_meta(page_id uuid PRIMARY KEY REFERENCES pages(id),workspace_id uuid,space_id uuid,node_type text,is_pinned boolean);
