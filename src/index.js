const { parseConfigFile, resolveBranchConfig, validateAndNormalize } = require('./config');
const { initGit, getLocalHeadHash, getTrackedFiles, getModifiedFiles, getCurrentBranch } = require('./git');
const FTPClient = require('./clients/ftp-client');
const SFTPClient = require('./clients/sftp-client');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

const SHA_REGEX = /^[0-9a-f]{40}$/i;

/**
 * Run a list of pre/post deploy hooks.
 * Each entry is either a string (inline command) or { script: "./path.sh" } (script file).
 */
async function runHooks(client, hooks, config, spinner, label) {
    if (!hooks || hooks.length === 0) return;

    if (config.protocol !== 'sftp') {
        spinner.warn(`${label} scripts require SFTP protocol. Skipping.`);
        return;
    }

    console.log(chalk.cyan(`\n🔧 Running ${label} scripts...`));

    for (const hook of hooks) {
        if (typeof hook === 'string') {
            // Inline command
            spinner.start(chalk.dim(`  → ${hook}`));
            await client.executeCommand(hook);
            spinner.succeed(chalk.dim(`  → ${hook}`));
        } else if (hook.script) {
            // Script file — resolve relative to local project dir
            const scriptPath = path.resolve(config.local_dir, hook.script);
            spinner.start(chalk.dim(`  → script: ${hook.script}`));
            await client.executeScript(scriptPath);
            spinner.succeed(chalk.dim(`  → script: ${hook.script}`));
        } else {
            spinner.warn(`  → Unknown hook format, skipping: ${JSON.stringify(hook)}`);
        }
    }
}

async function main(options) {
    console.log(chalk.blue.bold('🚀 Starting local-git-deploy\n'));

    // Phase 1: Parse raw config file (needed for local_dir before git init)
    const spinner = ora('Loading configuration...').start();
    let rawConfig;
    try {
        rawConfig = parseConfigFile(options.config);
        spinner.succeed('Configuration file parsed.');
    } catch (e) {
        spinner.fail(`Configuration error: ${e.message}`);
        process.exit(1);
    }

    // Phase 2: Initialize Git and detect branch
    const localDir = path.resolve(process.cwd(), rawConfig.local_dir || './');
    spinner.start('Initializing Git repository...');
    let git;
    try {
        git = await initGit(localDir);
        spinner.succeed('Git repository initialized.');
    } catch (e) {
        spinner.fail(e.message);
        process.exit(1);
    }

    let currentBranch;
    try {
        currentBranch = options.branch || await getCurrentBranch(git);
    } catch (e) {
        spinner.fail(`Failed to detect branch: ${e.message}`);
        process.exit(1);
    }

    // Phase 3: Resolve branch-specific config (if multi-branch layout)
    let config;
    try {
        const hasBranches = rawConfig.branches && typeof rawConfig.branches === 'object';

        if (hasBranches) {
            console.log(chalk.cyan(`  Branch: ${currentBranch}`));
            const resolved = resolveBranchConfig(rawConfig, currentBranch, options.force);
            if (resolved === null) {
                console.log(chalk.yellow(`\n⚠ Branch "${currentBranch}" is not configured for deployment. Skipping.`));
                console.log(chalk.yellow(`  Use --force to deploy using base config.\n`));
                process.exit(0);
            }
            config = validateAndNormalize(resolved);
        } else {
            config = validateAndNormalize(rawConfig);
        }

        spinner.succeed('Configuration resolved.');
    } catch (e) {
        spinner.fail(`Configuration error: ${e.message}`);
        process.exit(1);
    }

    let localHash;
    try {
        localHash = await getLocalHeadHash(git);
    } catch (e) {
        spinner.fail(`Failed to get local HEAD commit: ${e.message}`);
        process.exit(1);
    }

    const clientClass = config.protocol === 'sftp' ? SFTPClient : FTPClient;
    const client = new clientClass(config);

    spinner.start(`Connecting to ${config.server} via ${config.protocol.toUpperCase()}...`);
    try {
        await client.connect();
        spinner.succeed(`Connected to ${config.server}`);
    } catch (e) {
        spinner.fail(`Connection failed: ${e.message}`);
        process.exit(1);
    }

    try {
        // Pre-deploy hooks (before file sync)
        await runHooks(client, config.pre_deploy, config, spinner, 'pre-deploy');

        spinner.start('Checking remote sync state...');
        const remoteHash = await client.readStateFile();
        let uploadList = [];
        let deleteList = [];

        if (remoteHash) {
            // Validate hash before using it in a git command (fix: audit issue #5)
            if (!SHA_REGEX.test(remoteHash)) {
                throw new Error(`Invalid or corrupted hash in remote state file: "${remoteHash}". Delete the ${client.stateFileName} file on the server to perform a fresh full deploy.`);
            }

            spinner.succeed(`Found remote state (Last deploy: ${remoteHash.substring(0, 7)}). Checking for changes...`);

            if (remoteHash === localHash) {
                console.log(chalk.green('✅ Already up-to-date.'));
                return;
            }

            // Guard: the remote hash might not exist in the local git history
            // (e.g. after a force-push, rebase, or deploying from a different clone).
            // Fail loudly with an actionable message rather than silently doing the
            // wrong thing — a "full sync" fallback would skip deletions and leave
            // orphaned files on the server.
            try {
                await git.revparse(['--verify', remoteHash]);
            } catch {
                throw new Error(
                    `Remote commit ${remoteHash.substring(0, 7)} does not exist in your local git history. ` +
                    `This can happen after a force-push, rebase, or when deploying from a different clone. ` +
                    `To fix: delete the ${client.stateFileName} file on the server and run local-git-deploy again to perform a fresh full sync.`
                );
            }

            const diff = await getModifiedFiles(git, remoteHash, localHash, config.exclude);
            uploadList = diff.upload;
            deleteList = diff.remove;
        } else {
            spinner.info('No remote state found. Performing initial full sync...');
            uploadList = await getTrackedFiles(git, config.exclude);
        }

        if (uploadList.length === 0 && deleteList.length === 0) {
            console.log(chalk.green('✅ No changes to deploy.'));
        } else {
            console.log(chalk.cyan(`\n📦 Changes to sync:`));
            console.log(chalk.cyan(`   Uploads: ${uploadList.length}`));
            console.log(chalk.cyan(`   Deletes: ${deleteList.length}\n`));

            for (const file of deleteList) {
                spinner.start(chalk.red(`Deleting ${file}...`));
                await client.deleteFile(file);
                spinner.succeed(chalk.red(`Deleted ${file}`));
            }

            for (const file of uploadList) {
                spinner.start(chalk.green(`Uploading ${file}...`));
                const localFilePath = path.resolve(config.local_dir, file);
                await client.uploadFile(localFilePath, file);
                spinner.succeed(chalk.green(`Uploaded ${file}`));
            }

            // Post-deploy hooks (after file sync, before state update)
            // If these fail, state file is NOT updated — re-run will re-attempt everything.
            await runHooks(client, config.post_deploy, config, spinner, 'post-deploy');

            spinner.start('Updating remote sync state...');
            await client.writeStateFile(localHash);
            spinner.succeed('Remote sync state updated.');
            console.log(chalk.green.bold('\n🎉 Deployment successful!'));
        }
    } catch (e) {
        spinner.fail(`Sync error: ${e.message}`);
        process.exit(1);
    } finally {
        spinner.start('Disconnecting...');
        await client.disconnect();
        spinner.succeed('Disconnected safely.');
    }
}

module.exports = { main };
