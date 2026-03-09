const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const dotenv = require('dotenv');
const chalk = require('chalk');

function loadConfig(configPath) {
    dotenv.config();

    const resolvedPath = path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found at ${resolvedPath}`);
    }

    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    let config;
    try {
        config = resolvedPath.endsWith('.json')
            ? JSON.parse(fileContents)
            : yaml.parse(fileContents);
    } catch (error) {
        throw new Error(`Failed to parse config file: ${error.message}`);
    }

    const requiredFields = ['server', 'user', 'protocol', 'remote_dir'];
    for (const field of requiredFields) {
        if (!config[field]) {
            throw new Error(`Missing required configuration field: '${field}'`);
        }
    }

    const validProtocols = ['ftp', 'ftps', 'sftp'];
    if (!validProtocols.includes(config.protocol)) {
        throw new Error(`Invalid protocol '${config.protocol}'. Must be one of: ${validProtocols.join(', ')}`);
    }

    // Inject credentials from environment — env always takes priority over config file
    const envPassword = process.env.DEPLOY_PASSWORD;
    const envPrivateKey = process.env.DEPLOY_PRIVATE_KEY_PATH;

    if (envPassword) {
        config.password = envPassword;
    } else if (config.password) {
        // fix: audit issue #14 — warn when password is read from YAML to prevent accidental commit
        console.warn(chalk.yellow('⚠ Warning: DEPLOY_PASSWORD is not set in .env. Reading password from config file. This is insecure — add DEPLOY_PASSWORD to your .env file instead!'));
    }

    if (envPrivateKey) {
        config.privateKeyPath = envPrivateKey;
    }

    if (!config.password && !config.privateKeyPath) {
        throw new Error('No credentials provided. Set DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY_PATH in a .env file.');
    }

    config.port = config.port || (config.protocol === 'sftp' ? 22 : 21);
    config.exclude = config.exclude || ['.env', 'local-git-deploy.yml', 'local-git-deploy.json'];
    config.local_dir = path.resolve(process.cwd(), config.local_dir || './');
    config.insecure = config.insecure || false;

    return config;
}

module.exports = { loadConfig };
