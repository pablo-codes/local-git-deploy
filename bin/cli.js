#!/usr/bin/env node

const { program } = require('commander');
const { main } = require('../src/index.js');
const pkg = require('../package.json');

program
    .version(pkg.version)
    .description(pkg.description)
    .option('-c, --config <path>', 'Path to configuration file', 'local-git-deploy.yml')
    .option('-b, --branch <name>', 'Override branch detection (for CI/CD)')
    .option('-f, --force', 'Deploy even if branch is not mapped in config')
    .action(async (options) => {
        try {
            await main(options);
        } catch (error) {
            console.error('\nDeployment failed:', error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);
