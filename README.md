# local-git-deploy

[![npm version](https://img.shields.io/npm/v/local-git-deploy.svg)](https://www.npmjs.com/package/local-git-deploy)
[![npm downloads](https://img.shields.io/npm/dm/local-git-deploy.svg)](https://www.npmjs.com/package/local-git-deploy)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)

> **Deploy only what changed.** A fast, git-diff-powered CLI tool that syncs your local git project to a remote server via FTP, FTPS, or SFTP — no CI/CD pipeline required.

---

## Why local-git-deploy?

Most FTP/SFTP deploy tools re-upload your entire project on every run. `local-git-deploy` uses `git diff` to detect **only the files that changed** since your last deployment, making it:

- ⚡ **Fast** — uploads only changed files, not the whole project
- 🔐 **Secure** — keeps passwords and private keys out of your repo
- 🧹 **Clean** — automatically deletes removed or renamed files on the remote server
- 🖥️ **Local-first** — works from your machine, no GitHub Actions or CI server needed
- 🏠 **Shared hosting friendly** — perfect for cPanel, FTP-only hosts, and PHP projects

---

## Installation

Install globally via npm:

```bash
npm install -g local-git-deploy
```

---

## Setup & Configuration

In the root of your git project, create a `local-git-deploy.yml` (or `.json`) configuration file:

```yaml
server: ftp.your-server.com
user: your_username
protocol: ftp   # Options: ftp | ftps | sftp
port: 21        # 21 for FTP/FTPS, 22 for SFTP
remote_dir: /public_html
exclude:        # Glob patterns to exclude from deployment
  - ".env"
  - "local-git-deploy.yml"
  - "node_modules/**"
  - ".git/**"
```

### Secure Credentials with `.env`

> **Security Best Practice:** Never put passwords in your YAML config. Use a `.env` file instead (and make sure `.env` is in your `.gitignore`).

```env
# FTP / FTPS password
DEPLOY_PASSWORD=your_super_secret_password

# SFTP private key (optional)
DEPLOY_PRIVATE_KEY_PATH=/path/to/private/key.pem
```

_Tip: If your SFTP server requires both a private key and a passphrase, provide both `DEPLOY_PASSWORD` and `DEPLOY_PRIVATE_KEY_PATH`. The CLI handles both automatically._

---

## Usage

Commit your changes locally, then run:

```bash
local-git-deploy
```

The CLI will:

1. Connect to your remote server
2. Read the remote `.deploy-sync-state` file to find the last deployed commit
3. Run `git diff` between the remote commit and your local `HEAD`
4. Upload only new and modified files
5. Delete files that were removed or renamed
6. Update the remote state file with the new commit hash

### CLI Options

```
local-git-deploy [options]

Options:
  -c, --config <path>    Path to config file (default: "local-git-deploy.yml")
  -b, --branch <name>    Override branch detection (for CI/CD)
  -f, --force            Deploy even if branch is not mapped in config
  -V, --version          Output version number
  -h, --help             Display help
```

---

## Deploy Hooks (SFTP Only)

Run scripts or commands on the remote server **before** and/or **after** file sync. This is useful for tasks like putting a site into maintenance mode, running database migrations, clearing caches, or restarting services.

> **Note:** Deploy hooks require `protocol: sftp` since FTP/FTPS do not support remote command execution.

### Inline Commands

```yaml
server: example.com
user: deploy
protocol: sftp
remote_dir: /var/www/app

pre_deploy:
  - "cd /var/www/app && php artisan down"

post_deploy:
  - "cd /var/www/app && composer install --no-dev"
  - "cd /var/www/app && php artisan migrate --force"
  - "cd /var/www/app && php artisan cache:clear"
  - "cd /var/www/app && php artisan up"
```

### Script Files

For complex multi-line logic, reference a local script file. The tool will upload it to a temp location on the server, execute it, then clean up.

```yaml
pre_deploy:
  - script: ./scripts/backup-db.sh

post_deploy:
  - "cd /var/www/app && composer install --no-dev"
  - script: ./scripts/post-deploy.sh
```

### Error Handling

- If any hook **fails** (non-zero exit code), the deployment is **aborted**.
- The remote state file is **not updated** on failure — re-running `local-git-deploy` will re-attempt everything.
- stdout is streamed in real-time to your terminal; stderr is highlighted in red.

---

## Multi-Branch Deployment

Deploy different branches to different servers or directories — like GitHub Actions environments, but for FTP/SFTP.

### Configuration

Use the `branches:` key in your config. Top-level settings act as **defaults**, and each branch can **override any setting** — including `server`, `user`, `protocol`, `port`, and credentials.

```yaml
server: example.com
user: deploy
protocol: sftp

branches:
  main:
    remote_dir: /var/www/production
    password_env: DEPLOY_PASSWORD_PROD
    post_deploy:
      - "cd /var/www/production && php artisan migrate --force"
      - "cd /var/www/production && php artisan cache:clear"

  staging:
    remote_dir: /var/www/staging
    password_env: DEPLOY_PASSWORD_STAGING
    post_deploy:
      - "cd /var/www/staging && php artisan migrate --force"

  develop:
    server: dev.example.com        # different server entirely
    user: dev-deploy               # different user
    protocol: ftp                  # different protocol
    port: 2121
    remote_dir: /public_html/dev
    password_env: DEPLOY_PASSWORD_DEV

  "feature/*":                     # glob pattern for feature branches
    remote_dir: /var/www/preview
```

### Per-Branch Credentials

Each branch can read its password from a different environment variable using `password_env`:

```yaml
branches:
  main:
    password_env: DEPLOY_PASSWORD_PROD      # reads DEPLOY_PASSWORD_PROD from .env
  staging:
    password_env: DEPLOY_PASSWORD_STAGING   # reads DEPLOY_PASSWORD_STAGING from .env
```

```env
# .env
DEPLOY_PASSWORD_PROD=super_secret_prod
DEPLOY_PASSWORD_STAGING=staging_pass
```

If no `password_env` is specified, the default `DEPLOY_PASSWORD` is used.

### Branch Detection

The tool auto-detects the current git branch. You can override this with:

```bash
# Override branch (useful in CI/CD with detached HEAD)
local-git-deploy --branch staging

# Deploy an unmapped branch using base config defaults
local-git-deploy --force
```

### State File Isolation

Each branch gets its own state file on the remote server (e.g., `.deploy-sync-state-main`, `.deploy-sync-state-staging`). This prevents deploying from one branch from corrupting another branch's deployment state.

---

## Protocol Support

| Protocol | Port | Use Case |
|----------|------|----------|
| `ftp` | 21 | Basic shared hosting |
| `ftps` | 21 | FTP with TLS/SSL (cPanel, etc.) |
| `sftp` | 22 | SSH-based secure file transfer + deploy hooks |

---

## Features

- **Git-diff powered deploys** — only changed files are transferred
- **State tracking** — `.deploy-sync-state` file on the server tracks the last deployed commit
- **Deletion & rename handling** — automatically cleans up removed or renamed files on the remote
- **Pre/post-deploy hooks** — run commands or scripts on the server (SFTP only)
- **Multi-branch deployment** — deploy different branches to different servers/directories
- **Per-branch credentials** — each branch can use its own password via `password_env`
- **Glob branch matching** — use patterns like `feature/*` to match dynamic branches
- **Glob exclude patterns** — skip files like `node_modules`, `.env`, config files
- **Secure credential handling** — passwords and private keys loaded from `.env`
- **SFTP private key support** — supports passphrase-protected keys and two-factor SFTP servers
- **Connection timeouts** — prevents hanging on unreachable servers
- **Self-signed cert support** — opt-in with `insecure: true` for FTPS on dev servers
- **Resume-safe** — if a deploy fails midway, run again and it picks up safely

---

## Use Cases

- **Shared Hosting Deployments** — Deploy to cPanel, HostGator, GoDaddy, or any FTP/FTPS host.
- **PHP & Node.js Projects** — Ideal for Laravel, WordPress, CodeIgniter, Express, or custom apps.
- **CI/CD Alternative** — Get automated, branch-aware, incremental deploys without configuring GitHub Actions, GitLab CI, or Jenkins.
- **Post-Deploy Automation** — Run SSH hooks for database migrations, cache clearing, or restarting services automatically after a sync.
- **Static Site Hosting** — Quickly deploy HTML/CSS/JS bundles, React/Vue build folders, or static site generators.

---

## Troubleshooting

**Deployment failed midway?**
No problem. The `.deploy-sync-state` only updates on a successful deploy. Just fix the issue and re-run `local-git-deploy` — it will re-attempt only the affected files.

**Getting a "bad object" error?**
This usually means the state file on the server has a stale or invalid commit hash. Delete the `.deploy-sync-state` file from your remote server and re-run to do a clean sync.

**Filenames with spaces not working?**
Make sure you are on `v1.1.1` or later. Special character support was added in that release.

**Deploy hooks not running?**
Hooks require `protocol: sftp`. If you're using `ftp` or `ftps`, the tool will print a warning and skip hooks.

**Branch not configured?**
If you see "Branch X is not configured for deployment", either add your branch to the `branches:` config or use `--force` to deploy with base defaults.

---

## Contributing

Pull requests and issues are welcome! Please open an issue first to discuss any major changes.

- [Report a bug](https://github.com/pablo-codes/local-git-deploy/issues)
- [Request a feature](https://github.com/pablo-codes/local-git-deploy/issues)

---

## Author

**pablo-codes** — [GitHub](https://github.com/pablo-codes)

---

## License

[ISC](https://opensource.org/licenses/ISC)
