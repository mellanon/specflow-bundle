/**
 * Inbox Command (F-025)
 * Display priority-ranked review queue of features awaiting human approval.
 */

import {
  dbExists,
  getDbPath,
  initDatabase,
  closeDatabase,
  getDbInstance,
} from "../lib/database";
import {
  buildInbox,
  renderCompactInbox,
  renderVerboseInbox,
  renderJsonInbox,
} from "../lib/inbox";

export interface InboxCommandOptions {
  json?: boolean;
  verbose?: boolean;
}

export function inboxCommand(options: InboxCommandOptions = {}): void {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error(
      "Error: No SpecFlow database found. Run 'specflow init' first.",
    );
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const db = getDbInstance();
    const result = buildInbox(db, projectPath);

    if (options.json) {
      console.log(renderJsonInbox(result));
    } else if (options.verbose) {
      console.log(renderVerboseInbox(result));
    } else {
      console.log(renderCompactInbox(result));
    }
  } finally {
    closeDatabase();
  }
}
