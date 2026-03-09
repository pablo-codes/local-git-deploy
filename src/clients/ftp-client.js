const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const os = require('os');

class FTPClient {
    constructor(config) {
        this.config = config;
        this.client = new ftp.Client();
        this.client.ftp.socketTimeout = 30000;
    }

    async connect() {
        const secure = this.config.protocol === 'ftps';
        await this.client.access({
            host: this.config.server,
            user: this.config.user,
            password: this.config.password,
            port: this.config.port,
            secure: secure,
            // Only disable cert validation when user explicitly opts in via `insecure: true` in config
            secureOptions: (secure && this.config.insecure) ? { rejectUnauthorized: false } : undefined,
            timeout: 30000,
        });
    }

    disconnect() {
        this.client.close();
    }

    async ensureDir(remotePath) {
        const dir = path.dirname(remotePath).replace(/\\/g, '/');
        try {
            await this.client.ensureDir(dir);
            // basic-ftp's ensureDir changes the CWD; restore to remote_dir
            await this.client.cd(this.config.remote_dir);
        } catch (e) {
            // Directory likely already exists; ignore
        }
    }

    async uploadFile(localPath, remoteRelativePath) {
        // Always use absolute remote paths to avoid CWD ambiguity
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        await this.ensureDir(remotePath);
        await this.client.uploadFrom(localPath, remotePath);
    }

    async deleteFile(remoteRelativePath) {
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        try {
            await this.client.remove(remotePath);
        } catch (e) {
            if (e.code !== 550) {
                console.warn(`Could not delete ${remotePath}: ${e.message}`);
            }
        }
    }

    async readStateFile() {
        const remotePath = path.posix.join(this.config.remote_dir, '.deploy-sync-state').replace(/\\/g, '/');
        // Use os.tmpdir() + PID to avoid race conditions on parallel CI runs
        const localTempPath = path.join(os.tmpdir(), `.deploy-sync-state-${process.pid}.tmp`);
        try {
            await this.client.downloadTo(localTempPath, remotePath);
            const state = fs.readFileSync(localTempPath, 'utf8').trim();
            fs.unlinkSync(localTempPath);
            return state;
        } catch (e) {
            if (fs.existsSync(localTempPath)) fs.unlinkSync(localTempPath);
            return null;
        }
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

module.exports = FTPClient;
