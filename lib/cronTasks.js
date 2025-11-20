import processScheduledTasks from './processScheduledTasks';

let intervalStarted = false;
export function startScheduledTasksInterval() {
  if (intervalStarted) return;
  intervalStarted = true;
  console.info('Starting scheduled tasks interval (server only)');
  setInterval(() => {
    processScheduledTasks().catch(console.error);
  }, 5 * 60 * 1000); // 5 mins
}

// In a server-only entry point (e.g., lib/initServerTasks.js)
if (typeof window === 'undefined') startScheduledTasksInterval();
