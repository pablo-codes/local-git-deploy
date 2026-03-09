const SFTP = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');

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
        };

        if (this.config.privateKeyPath) {
            connectOptions.privateKey = fs.readFileSync(path.resolve(process.cwd(), this.config.privateKeyPath));
            // If a password is also provided, it might be a passphrase for an encrypted key,
            // or an actual password for two-factor authentication.
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
            await this.client.mkdir(dir, true); // recursive mkdir
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
        if (!exists) {
            return null;
        }
        
        const localTempPath = path.join(process.cwd(), '.deploy-sync-state.tmp');
        await this.client.fastGet(remotePath, localTempPath);
        
        const state = fs.readFileSync(localTempPath, 'utf8').trim();
        fs.unlinkSync(localTempPath);
        return state;
    }

    async writeStateFile(hash) {
        const remotePath = path.posix.join(this.config.remote_dir, '.deploy-sync-state').replace(/\\/g, '/');
        const localTempPath = path.join(process.cwd(), '.deploy-sync-state.tmp');
        
        fs.writeFileSync(localTempPath, hash);
        try {
            await this.uploadFile(localTempPath, '.deploy-sync-state');
        } finally {
            if (fs.existsSync(localTempPath)) {
                fs.unlinkSync(localTempPath);
            }
        }
    }
}

module.exports = SFTPClient;
