# Migration notes (JSON → SQLite)

On first boot (`ensureMigrated`):

1. Session secret: env `LINEDEV_SESSION_SECRET` → else `AppMeta.sessionSecret` → else `data/auth-secret.json` → else generate into volume.
2. User: if `User` empty and `data/auth.json` exists → import username/passwordHash/salt as-is (scrypt). Else seed from `INITIAL_ADMIN_PASSWORD`.
3. Runtime: if Agent/Line/Flex empty and `data/runtime-config.json` exists → import into `AgentConfig`, `LineConfig`, `FlexTemplate`.
4. Webhook users: previously in-memory only; new events go to `WebhookUser` table.

After successful migrate, JSON files are left in place (not deleted) so you can keep a backup. Safe to remove once you verified login + config.
