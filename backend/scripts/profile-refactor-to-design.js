#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const endpoint = process.env.CODESENSEI_BACKEND_URL || 'http://localhost:3000/api/refactor-to-design';
const payloadArg = process.argv[2];

if (!payloadArg) {
    console.error('Usage: node scripts/profile-refactor-to-design.js <payload-json-path>');
    process.exit(1);
}

const payloadPath = path.resolve(process.cwd(), payloadArg);

if (!fs.existsSync(payloadPath)) {
    console.error(`Payload file not found: ${payloadPath}`);
    process.exit(1);
}

let payload;
try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} catch (error) {
    console.error(`Failed to parse payload JSON: ${error.message}`);
    process.exit(1);
}

if (!payload.visualGraph || typeof payload.visualGraph !== 'object') {
    console.error('Payload must include a visualGraph object.');
    process.exit(1);
}

const requestId = `profile-${Date.now()}`;

async function run() {
    const start = performance.now();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-request-id': requestId
        },
        body: JSON.stringify(payload)
    });

    const elapsedMs = Number((performance.now() - start).toFixed(2));
    const body = await response.json().catch(() => ({}));

    console.log(`Request ID: ${requestId}`);
    console.log(`Endpoint:   ${endpoint}`);
    console.log(`Status:     ${response.status}`);
    console.log(`Round trip: ${elapsedMs}ms`);

    if (!response.ok) {
        console.error('Error response:', body);
        process.exit(1);
    }

    if (!body.profiling) {
        console.log('No profiling payload returned by backend.');
        return;
    }

    const profiling = body.profiling;
    console.log(`Backend total: ${profiling.totalMs}ms`);

    if (Array.isArray(profiling.steps) && profiling.steps.length > 0) {
        console.table(profiling.steps.map((step) => ({
            step: step.step,
            durationMs: step.durationMs,
            failed: step.failed ? 'yes' : 'no'
        })));
    }
}

run().catch((error) => {
    console.error(`Profiling request failed: ${error.message}`);
    process.exit(1);
});
