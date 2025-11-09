/**
 * Incremental Maintenance Module
 * Breaks large maintenance tasks into small chunks that can be processed
 * incrementally across multiple cron runs to avoid resource limits
 */

/**
 * Run incremental maintenance - processes a small chunk each time
 * Returns immediately if CPU time is approaching limit
 */
export async function runIncrementalMaintenance(env, config) {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 8; // Stop at 8ms to be safe (limit is 10ms)

  try {
    // Get current maintenance state
    const stateKey = `${config.KEEP_PREFIX_MAINTENANCE}incremental-state`;
    const stateData = await env.KV.get(stateKey);
    const state = stateData ? JSON.parse(stateData) : {
      phase: 'cleanup',
      cursor: null,
      processed: 0,
      startedAt: new Date().toISOString()
    };

    console.log(`Incremental maintenance: Phase ${state.phase}, Processed ${state.processed}`);

    // Phase 1: Cleanup old entries (process 10 keys at a time)
    if (state.phase === 'cleanup') {
      const processed = await cleanupIncremental(env, config, state, MAX_EXECUTION_TIME - (Date.now() - startTime));

      if (processed.complete) {
        // Move to next phase
        state.phase = 'backup-subscribers';
        state.cursor = null;
        state.processed = 0;
      } else {
        state.cursor = processed.cursor;
        state.processed += processed.count;
      }
    }

    // Phase 2: Backup subscribers (process 20 at a time)
    else if (state.phase === 'backup-subscribers') {
      const processed = await backupSubscribersIncremental(env, config, state, MAX_EXECUTION_TIME - (Date.now() - startTime));

      if (processed.complete) {
        // Move to next phase
        state.phase = 'backup-contacts';
        state.cursor = null;
        state.processed = 0;
      } else {
        state.cursor = processed.cursor;
        state.processed += processed.count;
      }
    }

    // Phase 3: Backup contacts (process 20 at a time)
    else if (state.phase === 'backup-contacts') {
      const processed = await backupContactsIncremental(env, config, state, MAX_EXECUTION_TIME - (Date.now() - startTime));

      if (processed.complete) {
        // All phases complete - reset for next run
        await env.KV.delete(stateKey);

        // Store completion record
        await env.KV.put(`${config.KEEP_PREFIX_MAINTENANCE}last-complete`, JSON.stringify({
          completedAt: new Date().toISOString(),
          totalProcessed: state.processed
        }));

        console.log('Incremental maintenance completed');
        return { complete: true };
      } else {
        state.cursor = processed.cursor;
        state.processed += processed.count;
      }
    }

    // Save state for next run
    await env.KV.put(stateKey, JSON.stringify(state));

    const elapsed = Date.now() - startTime;
    console.log(`Incremental maintenance chunk completed in ${elapsed}ms`);

    return {
      complete: false,
      phase: state.phase,
      processed: state.processed
    };

  } catch (error) {
    console.error('Incremental maintenance error:', error);
    throw error;
  }
}

/**
 * Cleanup old entries incrementally
 */
async function cleanupIncremental(env, config, state, maxTime) {
  const startTime = Date.now();
  const prefixesToClean = [
    { prefix: config.PREFIX_RATELIMIT, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
    { prefix: config.PREFIX_BOT_DETECT, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
    { prefix: config.PREFIX_CAPTCHA, maxAge: 60 * 60 * 1000 } // 1 hour
  ];

  let processed = 0;
  const now = Date.now();

  for (const { prefix, maxAge } of prefixesToClean) {
    // Check time limit
    if (Date.now() - startTime > maxTime) {
      return { complete: false, cursor: state.cursor, count: processed };
    }

    const list = await env.KV.list({
      prefix: prefix,
      limit: 5, // Process only 5 keys at a time
      cursor: state.cursor
    });

    if (!list || !list.keys || list.keys.length === 0) {
      continue;
    }

    for (const key of list.keys) {
      // Check time limit again
      if (Date.now() - startTime > maxTime) {
        return { complete: false, cursor: list.cursor, count: processed };
      }

      try {
        const value = await env.KV.get(key.name);
        if (value) {
          const data = JSON.parse(value);
          const timestamp = data.timestamp || data.createdAt;
          if (timestamp && (now - new Date(timestamp).getTime()) > maxAge) {
            await env.KV.delete(key.name);
            processed++;
          }
        }
      } catch (e) {
        // Skip invalid entries
      }
    }

    if (!list.list_complete) {
      return { complete: false, cursor: list.cursor, count: processed };
    }
  }

  return { complete: true, count: processed };
}

/**
 * Backup subscribers incrementally
 */
async function backupSubscribersIncremental(env, config, state, maxTime) {
  const startTime = Date.now();

  // Build CSV incrementally
  let csvKey = `${config.KEEP_PREFIX_MAINTENANCE}backup-csv-subscribers`;
  let existingCsv = await env.KV.get(csvKey) || 'email,ip_address,timestamp\n';

  const list = await env.KV.list({
    prefix: config.PREFIX_SUBSCRIBER,
    limit: 20, // Process 20 subscribers at a time
    cursor: state.cursor
  });

  if (!list || !list.keys || list.keys.length === 0) {
    // Save to GitHub if we have data
    if (existingCsv && existingCsv.length > 30) {
      await saveToGitHub(config, 'subscribers-backup.csv', existingCsv);
      await env.KV.delete(csvKey);
    }
    return { complete: true, count: 0 };
  }

  let processed = 0;

  for (const key of list.keys) {
    // Check time limit
    if (Date.now() - startTime > maxTime) {
      await env.KV.put(csvKey, existingCsv);
      return { complete: false, cursor: list.cursor, count: processed };
    }

    try {
      const data = await env.KV.get(key.name);
      if (data) {
        const email = key.name.replace(config.PREFIX_SUBSCRIBER, '');
        const subscriberData = JSON.parse(data);
        existingCsv += `"${email}","${subscriberData.ipAddress || ''}","${subscriberData.timestamp || ''}"\n`;
        processed++;
      }
    } catch (e) {
      // Skip invalid entries
    }
  }

  // Save progress
  await env.KV.put(csvKey, existingCsv);

  if (list.list_complete) {
    // Save to GitHub
    await saveToGitHub(config, 'subscribers-backup.csv', existingCsv);
    await env.KV.delete(csvKey);
    return { complete: true, count: processed };
  }

  return { complete: false, cursor: list.cursor, count: processed };
}

/**
 * Backup contacts incrementally
 */
async function backupContactsIncremental(env, config, state, maxTime) {
  const startTime = Date.now();

  // Build CSV incrementally
  let csvKey = `${config.KEEP_PREFIX_MAINTENANCE}backup-csv-contacts`;
  let existingCsv = await env.KV.get(csvKey) || 'email,name,phone,message,subscribed,ip_address,timestamp\n';

  const list = await env.KV.list({
    prefix: config.PREFIX_CONTACT,
    limit: 20, // Process 20 contacts at a time
    cursor: state.cursor
  });

  if (!list || !list.keys || list.keys.length === 0) {
    // Save to GitHub if we have data
    if (existingCsv && existingCsv.length > 50) {
      await saveToGitHub(config, 'contacts-backup.csv', existingCsv);
      await env.KV.delete(csvKey);
    }
    return { complete: true, count: 0 };
  }

  let processed = 0;

  for (const key of list.keys) {
    // Check time limit
    if (Date.now() - startTime > maxTime) {
      await env.KV.put(csvKey, existingCsv);
      return { complete: false, cursor: list.cursor, count: processed };
    }

    try {
      const data = await env.KV.get(key.name);
      if (data) {
        const contact = JSON.parse(data);
        existingCsv += `"${contact.email}","${contact.name}","${contact.phone}","${contact.message}","${contact.subscribed}","${contact.ipAddress || ''}","${contact.timestamp || ''}"\n`;
        processed++;
      }
    } catch (e) {
      // Skip invalid entries
    }
  }

  // Save progress
  await env.KV.put(csvKey, existingCsv);

  if (list.list_complete) {
    // Save to GitHub
    await saveToGitHub(config, 'contacts-backup.csv', existingCsv);
    await env.KV.delete(csvKey);
    return { complete: true, count: processed };
  }

  return { complete: false, cursor: list.cursor, count: processed };
}

/**
 * Simplified GitHub save function
 */
async function saveToGitHub(config, filename, content) {
  if (!config.GITHUB_TOKEN) {
    console.warn('GitHub token not configured, skipping backup');
    return;
  }

  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const path = `backups/${timestamp}-${filename}`;

    // Use the createOrUpdateFile from github.js
    const { createOrUpdateFile } = await import('../utils/github.js');

    await createOrUpdateFile(config, {
      repo: config.GITHUB_BACKUP_REPO,
      branch: config.GITHUB_BACKUP_BRANCH,
      path: path,
      content: content,
      message: `Incremental backup - ${filename} - ${new Date().toLocaleString()}`
    });

    console.log(`Saved ${filename} to GitHub`);
  } catch (error) {
    console.error('Error saving to GitHub:', error);
  }
}