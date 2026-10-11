import { PgBoss } from 'pg-boss';
import { logger } from './logger';
import { handleProcessItem } from './handlers';
import type { ProcessItemPayload } from './jobs';

async function start() {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    const boss = new PgBoss(dbUrl);

    boss.on('error', (error) => logger.error('pg-boss error:', error));

    await boss.start();
    logger.info("Lost & Found Worker started, connected to pg-boss.");

    await boss.work<ProcessItemPayload, void, { includeMetadata: true }>('process-item', { includeMetadata: true }, async (jobs) => {
        try {
            for (const job of jobs) {
                await handleProcessItem({
                    id: job.id,
                    type: 'process-item',
                    payload: job.data,
                    createdAt: job.createdOn.toISOString(),
                    attempts: job.retryCount,
                });
            }
        } catch (e) {
            logger.error("Error processing item:", e);
            throw e;
        }
    });
}

start().catch(e => {
    logger.error("Failed to start worker:", e);
    process.exit(1);
});
