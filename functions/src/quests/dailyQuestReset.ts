// Scheduled stub. Runs at 00:00 UTC daily. v1.1 is a no-op — the quest
// rollover is handled lazily in assignQuests / settleInTx on next access.
// Reserved for future notification hooks ("you have 3 fresh dailies").

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

export const dailyQuestReset = onSchedule(
  {
    schedule: '0 0 * * *',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async () => {
    logger.info('dailyQuestReset stub fired (v1.1 no-op)');
  },
);
