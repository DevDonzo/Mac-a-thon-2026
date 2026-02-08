const logger = require('./logger');

function nowMs() {
    return Number(process.hrtime.bigint()) / 1_000_000;
}

function estimateTokensFromText(text) {
    if (!text || typeof text !== 'string') {
        return 0;
    }

    // Conservative rough estimator for GPT/Gemini-family tokenization.
    return Math.ceil(text.length / 4);
}

function createStepProfiler(operation, context = {}) {
    const startedAt = nowMs();
    const steps = [];

    async function step(stepName, run, meta = {}) {
        const stepStartedAt = nowMs();

        try {
            const value = await run();
            const durationMs = Number((nowMs() - stepStartedAt).toFixed(2));
            const entry = {
                step: stepName,
                durationMs,
                ...meta
            };

            steps.push(entry);
            logger.info(`[profile] ${operation}.${stepName}`, { ...context, ...entry });
            return value;
        } catch (error) {
            const durationMs = Number((nowMs() - stepStartedAt).toFixed(2));
            const entry = {
                step: stepName,
                durationMs,
                failed: true,
                error: error.message,
                ...meta
            };

            steps.push(entry);
            logger.error(`[profile] ${operation}.${stepName} failed`, { ...context, ...entry });
            throw error;
        }
    }

    function finish(extra = {}) {
        const totalMs = Number((nowMs() - startedAt).toFixed(2));
        const summary = {
            operation,
            totalMs,
            steps,
            ...extra
        };

        logger.info(`[profile] ${operation}.summary`, { ...context, ...summary });
        return summary;
    }

    return {
        step,
        finish
    };
}

module.exports = {
    createStepProfiler,
    estimateTokensFromText
};
