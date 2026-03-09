const SFTP = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SFTPClient {
    constructor(config) {
        this.config = config;
        this.client = new SFTP();
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
        const remotePath = path.posix.join(this.config.remote_dir, '.deploy-sync-state').replace(/\\/g, '/');
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
            await this.uploadFile(localTempPath, '.deploy-sync-state');
        } finally {
            if (fs.existsSync(localTempPath)) fs.unlinkSync(localTempPath);
        }
    }
}

module.exports = SFTPClient;
