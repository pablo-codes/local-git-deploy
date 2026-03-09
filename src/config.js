const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const dotenv = require('dotenv');

/**
 * Loads and validates configuration from local-git-deploy.yml (or .json) and .env
 * @param {string} configPath Path to the configuration file
 * @returns {object} Validated configuration
 */
function loadConfig(configPath) {
    // 1. Load .env variables
    dotenv.config();

    // 2. Resolve absolute config path
    const resolvedPath = path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found at ${resolvedPath}`);
    }

    // 3. Read and parse config
    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    let config;
    try {
        if (resolvedPath.endsWith('.json')) {
            config = JSON.parse(fileContents);
        } else {
            config = yaml.parse(fileContents);
        }
    } catch (error) {
        throw new Error(`Failed to parse config file: ${error.message}`);
    }

    // 4. Validate mandatory fields
    const requiredFields = ['server', 'user', 'protocol', 'remote_dir'];
    for (const field of requiredFields) {
        if (!config[field]) {
            throw new Error(`Missing required configuration field: '${field}'`);
        }
    }

    // 5. Inject secure credentials from environment
    config.password = process.env.DEPLOY_PASSWORD || config.password;
    config.privateKeyPath = process.env.DEPLOY_PRIVATE_KEY_PATH || config.privateKeyPath;

    if (!config.password && !config.privateKeyPath) {
        throw new Error('No password or private key provided. Set DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY_PATH in a .env file.');
    }

    // 6. Set defaults
    config.port = config.port || (config.protocol === 'sftp' ? 22 : 21);
    config.exclude = config.exclude || ['.env', 'local-git-deploy.yml', 'local-git-deploy.json'];
    config.local_dir = config.local_dir || './';

    // Make local_dir an absolute path
    config.local_dir = path.resolve(process.cwd(), config.local_dir);

    return config;
}

module.exports = {
    loadConfig
};
