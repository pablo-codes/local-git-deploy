const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const dotenv = require('dotenv');
const chalk = require('chalk');
const micromatch = require('micromatch');

/**
 * Parse the config file (YAML or JSON) and load .env variables.
 * Returns the raw parsed config without branch resolution or validation.
 */
function parseConfigFile(configPath) {
    dotenv.config();

    const resolvedPath = path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found at ${resolvedPath}`);
    }

    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    try {
        return resolvedPath.endsWith('.json')
            ? JSON.parse(fileContents)
            : yaml.parse(fileContents);
    } catch (error) {
        throw new Error(`Failed to parse config file: ${error.message}`);
    }
}

/**
 * Resolve branch-specific config if the file uses multi-branch layout.
 * Returns null if the branch isn't mapped (and force is false).
 */
function resolveBranchConfig(rawConfig, branch, force) {
    if (!rawConfig.branches || typeof rawConfig.branches !== 'object') {
        // Flat config — no branch resolution needed
        return rawConfig;
    }

    const { branches, ...defaults } = rawConfig;

    // Try exact match first, then glob/wildcard match
    let branchConfig = branches[branch];
    if (!branchConfig) {
        const matchedKey = Object.keys(branches).find(
            pattern => micromatch.isMatch(branch, pattern)
        );
        branchConfig = matchedKey ? branches[matchedKey] : null;
    }

    if (!branchConfig && !force) {
        // Branch not mapped and --force not used → signal skip
        return null;
    }

    // Shallow merge: branch overrides win over top-level defaults
    const resolved = { ...defaults, ...(branchConfig || {}) };
    resolved._branch = branch;
    return resolved;
}

/**
 * Validate and normalize a resolved config object.
 * Handles credential loading, defaults, and hook validation.
 */
function validateAndNormalize(config) {
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
    // Per-branch password_env overrides the default DEPLOY_PASSWORD env var name
    const passwordEnvVar = config.password_env || 'DEPLOY_PASSWORD';
    const envPassword = process.env[passwordEnvVar];
    const envPrivateKey = process.env.DEPLOY_PRIVATE_KEY_PATH;

    if (envPassword) {
        config.password = envPassword;
    } else if (config.password_env) {
        // password_env was specified but the env var is empty/missing
        console.warn(chalk.yellow(`⚠ Warning: ${passwordEnvVar} is not set in .env but 'password_env' references it.`));
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

    // Validate hook arrays (pre_deploy / post_deploy)
    for (const hookKey of ['pre_deploy', 'post_deploy']) {
        if (config[hookKey]) {
            if (!Array.isArray(config[hookKey])) {
                throw new Error(`'${hookKey}' must be an array of commands or {script: path} objects.`);
            }
            for (const entry of config[hookKey]) {
                if (typeof entry !== 'string' && (!entry || typeof entry.script !== 'string')) {
                    throw new Error(
                        `Invalid ${hookKey} entry: ${JSON.stringify(entry)}. ` +
                        `Must be a command string or { script: "./path.sh" }`
                    );
                }
            }
        }
    }

    return config;
}

/**
 * Full config loading pipeline for backward compatibility.
 * Parses file, optionally resolves branch config, then validates.
 */
function loadConfig(configPath, branchInfo) {
    const rawConfig = parseConfigFile(configPath);

    let resolved;
    if (branchInfo && branchInfo.branch) {
        resolved = resolveBranchConfig(rawConfig, branchInfo.branch, branchInfo.force);
        if (resolved === null) return null;
    } else {
        resolved = rawConfig;
    }

    return validateAndNormalize(resolved);
}

module.exports = { parseConfigFile, resolveBranchConfig, validateAndNormalize, loadConfig };
