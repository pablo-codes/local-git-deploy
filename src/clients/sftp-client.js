const SFTP = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chalk = require('chalk');

class SFTPClient {
    constructor(config) {
        this.config = config;
        this.client = new SFTP();
        // Per-branch state file naming: feature/login → .deploy-sync-state-feature-login
        this.stateFileName = config._branch
            ? `.deploy-sync-state-${config._branch.replace(/\//g, '-')}`
            : '.deploy-sync-state';
    }

    async connect() {
        const connectOptions = {
            host: this.config.server,
            port: this.config.port,
            username: this.config.user,
            readyTimeout: 20000,
            retries: 1,
        };

        if (this.config.privateKeyPath) {
            // Expand `~` since Node's path.resolve does not handle it
            const expandedPath = this.config.privateKeyPath.startsWith('~')
                ? path.join(os.homedir(), this.config.privateKeyPath.slice(1))
                : this.config.privateKeyPath;

            connectOptions.privateKey = fs.readFileSync(path.resolve(process.cwd(), expandedPath));

            // If a password is also provided, use it as key passphrase (and optionally password for 2FA)
            if (this.config.password) {
                connectOptions.passphrase = this.config.password;
                connectOptions.password = this.config.password;
            }
        } else if (this.config.password) {
            connectOptions.password = this.config.password;
        }

        await this.client.connect(connectOptions);
    }

    async disconnect() {
        await this.client.end();
    }

    async ensureDir(remotePath) {
        const dir = path.dirname(remotePath).replace(/\\/g, '/');
        const exists = await this.client.exists(dir);
        if (!exists) {
            await this.client.mkdir(dir, true);
        }
    }

    async uploadFile(localPath, remoteRelativePath) {
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        await this.ensureDir(remotePath);
        await this.client.put(localPath, remotePath);
    }

    async deleteFile(remoteRelativePath) {
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        const exists = await this.client.exists(remotePath);
        if (exists) {
            await this.client.delete(remotePath);
        }
    }

    async readStateFile() {
        const remotePath = path.posix.join(this.config.remote_dir, this.stateFileName).replace(/\\/g, '/');
        const exists = await this.client.exists(remotePath);
        if (!exists) return null;

        // Use os.tmpdir() + PID to avoid race conditions on parallel CI runs
        const localTempPath = path.join(os.tmpdir(), `.deploy-sync-state-${process.pid}.tmp`);
        await this.client.fastGet(remotePath, localTempPath);
        const state = fs.readFileSync(localTempPath, 'utf8').trim();
        fs.unlinkSync(localTempPath);
        return state;
    }

    async writeStateFile(hash) {
        const localTempPath = path.join(os.tmpdir(), `.deploy-sync-state-${process.pid}.tmp`);
        fs.writeFileSync(localTempPath, hash);
        try {
            await this.uploadFile(localTempPath, this.stateFileName);
        } finally {
            if (fs.existsSync(localTempPath)) fs.unlinkSync(localTempPath);
        }
    }

    /**
     * Execute a command on the remote server via the underlying SSH connection.
     * Streams stdout/stderr in real-time and rejects on non-zero exit code.
     */
    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            // Access the underlying ssh2.Client from ssh2-sftp-client
            const sshClient = this.client.client;

            sshClient.exec(command, (err, stream) => {
                if (err) return reject(err);

                let stdout = '';
                let stderr = '';

                stream.on('data', (data) => {
                    stdout += data.toString();
                    process.stdout.write(chalk.dim(data.toString()));
                });

                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                    process.stderr.write(chalk.red(data.toString()));
                });

                stream.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Command exited with code ${code}: ${stderr.trim()}`));
                    } else {
                        resolve({ stdout, stderr, code });
                    }
                });
            });
        });
    }

    /**
     * Upload a local script file to a temp location on the server,
     * make it executable, run it, then clean up.
     */
    async executeScript(localScriptPath) {
        const remoteTmpPath = `/tmp/.deploy-script-${process.pid}-${Date.now()}.sh`;

        // Upload the script directly (absolute path, not relative to remote_dir)
        await this.client.put(localScriptPath, remoteTmpPath);
        await this.executeCommand(`chmod +x ${remoteTmpPath}`);

        try {
            await this.executeCommand(remoteTmpPath);
        } finally {
            // Clean up remote temp script
            await this.executeCommand(`rm -f ${remoteTmpPath}`);
        }
    }
}

module.exports = SFTPClient;
