const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

class FTPClient {
    constructor(config) {
        this.config = config;
        this.client = new ftp.Client();
        // this.client.ftp.verbose = true;
    }

    async connect() {
        const secure = this.config.protocol === 'ftps';
        await this.client.access({
            host: this.config.server,
            user: this.config.user,
            password: this.config.password,
            port: this.config.port,
            secure: secure,
            secureOptions: { rejectUnauthorized: false } // In case of self string certs
        });
    }

    disconnect() {
        this.client.close();
    }

    async ensureDir(remotePath) {
        const dir = path.dirname(remotePath).replace(/\\/g, '/');
        try {
            await this.client.ensureDir(dir);
            await this.client.cd(this.config.remote_dir);
        } catch (e) {
            // Might already exist
        }
    }

    async uploadFile(localPath, remoteRelativePath) {
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        await this.ensureDir(remotePath);
        await this.client.uploadFrom(localPath, remotePath);
    }

    async deleteFile(remoteRelativePath) {
        const remotePath = path.posix.join(this.config.remote_dir, remoteRelativePath).replace(/\\/g, '/');
        try {
            await this.client.remove(remotePath);
        } catch (e) {
            // Ignore if file doesn't exist
            if (e.code !== 550) {
                console.warn(`Could not delete ${remotePath}: ${e.message}`);
            }
        }
    }

    async readStateFile() {
        const remotePath = path.posix.join(this.config.remote_dir, '.deploy-sync-state').replace(/\\/g, '/');
        const localTempPath = path.join(process.cwd(), '.deploy-sync-state.tmp');
        try {
            await this.client.downloadTo(localTempPath, remotePath);
            const state = fs.readFileSync(localTempPath, 'utf8').trim();
            fs.unlinkSync(localTempPath);
            return state;
        } catch (e) {
            // State file likely doesn't exist
            if (fs.existsSync(localTempPath)) {
                fs.unlinkSync(localTempPath);
            }
            return null;
        }
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

module.exports = FTPClient;
