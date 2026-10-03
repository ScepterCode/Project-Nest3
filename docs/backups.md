# Database backups

The Supabase free plan keeps no backups, so the
[Database backup](../.github/workflows/db-backup.yml) workflow makes one every
day at 02:17 UTC. Each run dumps the database (roles, schema and data,
including user accounts), encrypts it and stores it as a workflow artifact
for 90 days. The daily connection also keeps the free project from being
paused for inactivity.

**Not included:** files in Supabase Storage (uploaded submissions). The dump
only has their metadata.

## Setup (once)

Two repository secrets (GitHub → Settings → Secrets and variables → Actions):

- `SUPABASE_DB_URL`: Supabase dashboard → **Connect** → **Session pooler**
  connection string, with your database password filled in. (The direct
  connection is IPv6-only, which GitHub's runners can't reach.)
- `BACKUP_PASSPHRASE`: a long random passphrase. **Save it in your password
  manager**: backups can't be decrypted without it, and GitHub won't show it
  again.

Or from a terminal (each command prompts for the value):

```bash
gh secret set SUPABASE_DB_URL
gh secret set BACKUP_PASSPHRASE
```

Then run it once by hand to check: GitHub → Actions → **Database backup** →
**Run workflow**, or `gh workflow run db-backup.yml`.

The repo is public, so anyone signed in to GitHub can download the artifacts.
That's why they're encrypted; never upload an unencrypted dump.

GitHub disables scheduled workflows in public repos after 60 days without a
commit. If that happens, re-enable it on the Actions tab.

## Restore

1. Download a backup: Actions → **Database backup** → a run → Artifacts, or

   ```bash
   gh run download <run-id>
   ```

2. Decrypt and unpack (prompts for the passphrase):

   ```bash
   gpg -d db-backup-<date>.tar.gz.gpg | tar -xzf -
   ```

   This gives `roles.sql`, `schema.sql` and `data.sql`.

3. Restore into a database, ideally a **new** Supabase project, so a bad
   restore can't damage the live one. With its connection string in
   `$DB_URL`:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$DB_URL"
   ```

   `session_replication_role = replica` skips triggers and foreign-key
   checks while loading, so rows can go in any order.
