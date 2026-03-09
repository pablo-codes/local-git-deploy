# local-git-deploy

A globally installable npm CLI application that synchronizes a local git working directory with a remote server using FTP, FTPS, or SFTP.

Unlike typical CI/CD actions, this tool operates independently of remote Git hosts (like GitHub or GitLab). It is designed to deploy changes directly from your local machine to your server, ensuring only files that have changed (added, modified, or deleted) since the last deployment are transferred.

## Features

- **Git Diff Powered:** Uses `git diff` to determine exactly which files have been modified or added, drastically speeding up deployments.
- **State Tracking:** Maintains a `.deploy-sync-state` file on your server to track the last deployed commit.
- **Handles Deletions & Renames:** Automatically removes deleted or renamed files on the remote server to keep it clean.
- **Secure Handling:** Supports `.env` to keep passwords and private keys out of your Git history.
- **Extensive Protocol Support:** FTP, FTPS, and SFTP.

## Installation

Install globally via npm:

```bash
npm install -g local-git-deploy
```

## Setup & Configuration

In the root of your git project, create a `local-git-deploy.yml` (or `.json`) file:

```yaml
server: ftp.your-server.com
user: your_username
protocol: ftp # Options: ftp, ftps, sftp
port: 21 # 21 for FTP, 22 for SFTP
remote_dir: /public_html
exclude: # Glob patterns to ignore
  - ".env"
  - "local-git-deploy.yml"
  - "node_modules/**"
  - ".git/**"
```

**Security Best Practice:**
Do **NOT** put your password in the YAML file. Instead, create a `.env` file in your project root (ensure `.env` is in your `.gitignore`!):

```env
DEPLOY_PASSWORD=your_super_secret_password
```

For SFTP with private keys:

```env
DEPLOY_PRIVATE_KEY_PATH=/path/to/private/key.pem
```

_Note: If your server uses SFTP and requires BOTH a private key and a passphrase (or password), simply provide both `DEPLOY_PASSWORD` and `DEPLOY_PRIVATE_KEY_PATH` in your `.env` file. The CLI will automatically use the password to unlock your key or satisfy the server's two-factor requirement._

## Usage

Commit your changes locally, then simply run:

```bash
local-git-deploy
```

The CLI will:

1. Connect to your server.
2. Read the remote state file.
3. Compare the remote commit with your local `HEAD`.
4. Upload new files and delete removed files.
5. Update the remote state file to the new commit hash.

## Troubleshooting

- If a deployment fails midway, the `.deploy-sync-state` will **not** update. This means you can simply fix the issue and run `local-git-deploy` again to safely resume.

## Author

- Pablo-Codes
