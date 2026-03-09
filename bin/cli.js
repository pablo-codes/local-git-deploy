#!/usr/bin/env node

const { program } = require('commander');
const { main } = require('../src/index.js');
const pkg = require('../package.json');

program
    .version(pkg.version)
    .description(pkg.description)
    .option('-c, --config <path>', 'Path to configuration file', 'local-git-deploy.yml')
    .action(async (options) => {
        try {
            await main(options);
        } catch (error) {
            console.error('\nDeployment failed:', error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);
