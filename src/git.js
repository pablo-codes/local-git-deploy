const simpleGit = require('simple-git');
const path = require('path');
const micromatch = require('micromatch');

/**
 * Validates that the directory is a git repository
 * @param {string} localDir 
 * @returns {import('simple-git').SimpleGit}
 */
async function initGit(localDir) {
    const git = simpleGit(localDir);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
        throw new Error(`Directory ${localDir} is not a git repository.`);
    }
    return git;
}

/**
 * Gets the current commit hash (HEAD)
 * @param {import('simple-git').SimpleGit} git 
 * @returns {Promise<string>}
 */
async function getLocalHeadHash(git) {
    return await git.revparse(['HEAD']);
}

/**
 * Gets all tracked files in the git repository, filtered by ignore patterns
 * @param {import('simple-git').SimpleGit} git 
 * @param {string[]} excludePatterns Glob patterns to exclude
 * @returns {Promise<string[]>} Array of file paths relative to git root
 */
async function getTrackedFiles(git, excludePatterns = []) {
    // git ls-files returns all currently tracked files
    const result = await git.raw(['ls-files']);
    const files = result.split('\n').filter(Boolean);
    
    // Filter out excluded files
    if (excludePatterns.length > 0) {
        return files.filter(file => !micromatch.isMatch(file, excludePatterns));
    }
    return files;
}

/**
 * Gets added, modified, deleted, and renamed files between two commits
 * @param {import('simple-git').SimpleGit} git 
 * @param {string} remoteHash The last deployed commit hash on the remote server
 * @param {string} localHash The current HEAD commit hash
 * @param {string[]} excludePatterns Glob patterns to exclude
 * @returns {Promise<{upload: string[], remove: string[]}>}
 */
async function getModifiedFiles(git, remoteHash, localHash, excludePatterns = []) {
    // git diff --name-status remoteHash localHash
    const diffSummary = await git.raw(['diff', '--name-status', remoteHash, localHash]);
    const lines = diffSummary.split('\n').filter(Boolean);

    const upload = [];
    const remove = [];

    for (const line of lines) {
        // Line format: "M\tpath/to/file" or "R100\told/path\tnew/path"
        const parts = line.split('\t');
        const status = parts[0];

        // Ensure we don't process excluded files
        const fileUploadCandidate = parts[parts.length - 1]; // Works for "M file" and "R old new"
        const isExcluded = excludePatterns.length > 0 && micromatch.isMatch(fileUploadCandidate, excludePatterns);
        
        if (status.startsWith('D')) { // Deleted
             remove.push(parts[1]);
        } else if (status.startsWith('R')) { // Renamed
             if (!excludePatterns.length || !micromatch.isMatch(parts[1], excludePatterns)) {
                 remove.push(parts[1]); // Delete old path
             }
             if (!isExcluded) {
                 upload.push(parts[2]); // Upload new path
             }
        } else if (['A', 'C', 'M'].some(s => status.startsWith(s))) { // Added, Copied, Modified
             if (!isExcluded) {
                 upload.push(parts[1]);
             }
        } else {
             // Handle 'T' (type change) or others as modified
             if (!isExcluded && parts[1]) {
                 upload.push(parts[1]);
             }
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
