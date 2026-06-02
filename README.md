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
- 🔒 **Secure** — keeps passwords and private keys out of your repo
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

---

## Protocol Support

| Protocol | Port | Use Case |
|----------|------|----------|
| `ftp` | 21 | Basic shared hosting |
| `ftps` | 21 | FTP with TLS/SSL (cPanel, etc.) |
| `sftp` | 22 | SSH-based secure file transfer |

---

## Features

- **Git-diff powered deploys** — only changed files are transferred
- **State tracking** — maintains a `.deploy-sync-state` file on the server to track the last deployed commit hash
- **Deletion & rename handling** — automatically cleans up removed or renamed files on the remote
- **Glob exclude patterns** — skip files like `node_modules`, `.env`, config files
- **Secure credential handling** — passwords and private keys loaded from `.env`, never from config files
- **SFTP private key support** — supports passphrase-protected keys and two-factor SFTP servers
- **Connection timeouts** — prevents hanging on unreachable servers
- **Self-signed cert support** — opt-in with `insecure: true` for FTPS on dev servers
- **Resume-safe** — if a deploy fails midway, run again and it picks up safely

---

## Troubleshooting

**Deployment failed midway?**  
No problem. The `.deploy-sync-state` only updates on a successful deploy. Just fix the issue and re-run `local-git-deploy` — it will re-attempt only the affected files.

**Getting a "bad object" error?**  
This usually means the state file on the server has a stale or invalid commit hash. Delete the `.deploy-sync-state` file from your remote server and re-run to do a clean sync.

**Filenames with spaces not working?**  
Make sure you are on `v1.1.1` or later. Special character support was added in that release.

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
