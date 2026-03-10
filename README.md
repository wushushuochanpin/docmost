<div align="center">
    <h1><b>SuperChat</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

To get started with SuperChat, please refer to our [documentation](https://docmost.com/docs) or try our [cloud version](https://docmost.com/pricing) .

## Self-hosting notes

- Copy `.env.example` to `.env`, then set `APP_URL`, `APP_SECRET`, and `DOCMOST_DB_PASSWORD`.
- Start the stack with `docker compose up -d --build`, then open `/setup/register` to create the first workspace and admin account.
- The default `docker-compose.yml` binds the app to `127.0.0.1:3000`, which is intended for use behind Nginx or another reverse proxy.
- `STORAGE_DRIVER=local` is the default. Only set `AWS_S3_*` when you want S3-compatible object storage such as Tencent COS for attachments.
- `BACKUP_ENABLED=true` in `.env.example`, so the Backup & Restore page is available on fresh self-hosted installs.
- Backup artifacts are written to local disk under `BACKUP_LOCAL_PATH` by default. Set `BACKUP_S3_ENABLED=true` to upload the same package to COS/S3 as a second copy, using the existing `AWS_S3_*` config and `BACKUP_S3_PREFIX`.
- If you publish your fork, set `APP_SOURCE_URL` to that public GitHub repository so the in-product source link points to the correct code.

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License

SuperChat core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).

All files in the following directories are licensed under the SuperChat Enterprise license defined in `packages/ee/License`.

- apps/server/src/ee
- apps/client/src/ee
- packages/ee

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks

Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.

<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.
