const simpleGit = require('simple-git');
const path = require('path');
const micromatch = require('micromatch');

async function initGit(localDir) {
    const git = simpleGit(localDir);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
        throw new Error(`Directory ${localDir} is not a git repository.`);
    }
    return git;
}

async function getLocalHeadHash(git) {
    return (await git.revparse(['HEAD'])).trim();
}

async function getTrackedFiles(git, excludePatterns = []) {
    // Use -z (null-terminated) to safely handle filenames with spaces or special characters
    const result = await git.raw(['ls-files', '-z']);
    const files = result.split('\0').filter(Boolean);

    if (excludePatterns.length > 0) {
        return files.filter(file => !micromatch.isMatch(file, excludePatterns));
    }
    return files;
}

async function getModifiedFiles(git, remoteHash, localHash, excludePatterns = []) {
    // Use -z (null-terminated) to safely handle filenames with spaces or special characters
    const diffSummary = await git.raw(['diff', '--name-status', '-z', remoteHash, localHash]);
    const entries = diffSummary.split('\0').filter(Boolean);

    const upload = [];
    const remove = [];

    let i = 0;
    while (i < entries.length) {
        const status = entries[i];
        i++;

        if (status.startsWith('R') || status.startsWith('C')) {
            // Rename/Copy: next two tokens are old path and new path
            const oldPath = entries[i++];
            const newPath = entries[i++];

            // Delete old path on remote unless it matches an exclude pattern
            // We intentionally check the OLD path here for the delete side
            if (!excludePatterns.length || !micromatch.isMatch(oldPath, excludePatterns)) {
                remove.push(oldPath);
            }
            // Upload new path unless excluded
            if (!excludePatterns.length || !micromatch.isMatch(newPath, excludePatterns)) {
                upload.push(newPath);
            }
        } else if (status.startsWith('D')) {
            const filePath = entries[i++];
            // Apply exclude pattern check consistently (fix: audit issue #3)
            if (!excludePatterns.length || !micromatch.isMatch(filePath, excludePatterns)) {
                remove.push(filePath);
            }
        } else if (['A', 'C', 'M', 'T'].some(s => status.startsWith(s))) {
            const filePath = entries[i++];
            if (!excludePatterns.length || !micromatch.isMatch(filePath, excludePatterns)) {
                upload.push(filePath);
            }
        } else {
            // Unknown status token; skip it
            i++;
        }
    }

    return { upload, remove };
}

module.exports = {
    initGit,
    getLocalHeadHash,
    getTrackedFiles,
    getModifiedFiles
};
