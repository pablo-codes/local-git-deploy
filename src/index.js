const { loadConfig } = require('./config');
const { initGit, getLocalHeadHash, getTrackedFiles, getModifiedFiles } = require('./git');
const FTPClient = require('./clients/ftp-client');
const SFTPClient = require('./clients/sftp-client');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

const SHA_REGEX = /^[0-9a-f]{40}$/i;

async function main(options) {
    console.log(chalk.blue.bold('🚀 Starting local-git-deploy\n'));

    const spinner = ora('Loading configuration...').start();
    let config;
    try {
        config = loadConfig(options.config);
        spinner.succeed('Configuration loaded.');
    } catch (e) {
        spinner.fail(`Configuration error: ${e.message}`);
        process.exit(1);
    }

    spinner.start('Initializing Git repository...');
    let git;
    try {
        git = await initGit(config.local_dir);
        spinner.succeed('Git repository initialized.');
    } catch (e) {
        spinner.fail(e.message);
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
        spinner.start('Checking remote sync state...');
        const remoteHash = await client.readStateFile();
        let uploadList = [];
        let deleteList = [];

        if (remoteHash) {
            // Validate hash before using it in a git command (fix: audit issue #5)
            if (!SHA_REGEX.test(remoteHash)) {
                throw new Error(`Invalid or corrupted hash in remote state file: "${remoteHash}". Delete the .deploy-sync-state file on the server to perform a fresh full deploy.`);
            }

            spinner.succeed(`Found remote state (Last deploy: ${remoteHash.substring(0, 7)}). Checking for changes...`);

            // fix: audit issue #7 — disconnect is always called via finally, even on early return
            if (remoteHash === localHash) {
                console.log(chalk.green('✅ Already up-to-date.'));
                return;
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
