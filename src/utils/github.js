/**
 * GitHub API utility functions - FIXED VERSION
 */

import { withRetry, withHttpRetry } from './retry.js';

/**
 * Convert string to base64
 */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Get file from GitHub repository
 */
export async function getFile(config, { repo, branch, path }) {
  const url = `https://api.github.com/repos/${config.GITHUB_OWNER}/${repo}/contents/${path}?ref=${branch}`;

  const result = await withHttpRetry(url, {
    headers: {
      'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Cloudflare-Worker'
    }
  }, {
    maxAttempts: 3,
    initialDelay: 1000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504]
  });

  if (!result.success) {
    if (result.error?.status === 404) {
      return null; // File doesn't exist
    }
    console.error('Error getting file from GitHub:', result.error);
    throw result.error;
  }

  const data = await result.result.json();
  return data;
}

/**
 * Create or update file in GitHub repository - FIXED VERSION
 */
export async function createOrUpdateFile(config, { repo, branch, path, content, message }) {
  // Validate inputs
  if (!config.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is missing');
    return {
      success: false,
      error: 'GITHUB_TOKEN is not configured'
    };
  }

  if (!config.GITHUB_OWNER) {
    console.error('GITHUB_OWNER is missing');
    return {
      success: false,
      error: 'GITHUB_OWNER is not configured'
    };
  }

  try {
    console.log(`Attempting to update file: ${config.GITHUB_OWNER}/${repo}/${path} on branch ${branch}`);

    // Check if file exists first
    let existingFile = null;
    try {
      existingFile = await getFile(config, { repo, branch, path });
      console.log(`File ${path} exists, will update with SHA: ${existingFile?.sha}`);
    } catch (error) {
      console.log(`File ${path} does not exist, will create new file`);
    }

    const url = `https://api.github.com/repos/${config.GITHUB_OWNER}/${repo}/contents/${path}`;

    const body = {
      message: message,
      content: toBase64(content),
      branch: branch
    };

    // If file exists, include its SHA for update
    if (existingFile && existingFile.sha) {
      body.sha = existingFile.sha;
    }

    console.log(`Making PUT request to GitHub API...`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Cloudflare-Worker'
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status} - ${responseText.substring(0, 500)}`);

      // Parse error message
      let errorMessage = `GitHub API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.message || errorMessage;

        // Check for specific errors
        if (response.status === 401) {
          errorMessage = 'Invalid GitHub token - please check GITHUB_TOKEN';
        } else if (response.status === 403) {
          errorMessage = 'GitHub token lacks permissions - ensure it has repo write access';
        } else if (response.status === 404) {
          errorMessage = `Repository ${config.GITHUB_OWNER}/${repo} not found or branch ${branch} does not exist`;
        } else if (response.status === 422) {
          errorMessage = `Validation failed: ${errorJson.errors?.[0]?.message || errorJson.message}`;
        }
      } catch (e) {
        // Keep original error message if parsing fails
      }

      return {
        success: false,
        error: errorMessage
      };
    }

    const result = JSON.parse(responseText);
    console.log(`Successfully updated file ${path} - new SHA: ${result.content?.sha}`);

    return {
      success: true,
      sha: result.content?.sha,
      url: result.content?.html_url
    };

  } catch (error) {
    console.error('Error in createOrUpdateFile:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Backup KV data to GitHub as CSV
 */
export async function backupToGitHub(config, csvContent) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `kv-backup-${timestamp}.csv`;
  const path = config.GITHUB_BACKUP_PATH || fileName;

  const result = await createOrUpdateFile(config, {
    repo: config.GITHUB_BACKUP_REPO,
    branch: config.GITHUB_BACKUP_BRANCH,
    path: path,
    content: csvContent,
    message: `KV backup - ${new Date().toLocaleString()}`
  });

  return result;
}

/**
 * Save contact form submission to GitHub
 */
export async function saveContactToGitHub(config, contactData) {
  const content = JSON.stringify(contactData, null, 2);

  const result = await createOrUpdateFile(config, {
    repo: config.GITHUB_CONTACT_REPO,
    branch: config.GITHUB_CONTACT_BRANCH,
    path: config.GITHUB_CONTACT_PATH,
    content: content,
    message: `Contact from ${contactData.name} <${contactData.email}>`
  });

  return result;
}