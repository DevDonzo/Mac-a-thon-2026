/**
 * Backend test script
 * Run with: npm test (after starting the server)
 */

const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

function log(test, passed, message = '') {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${test}${message ? ': ' + message : ''}`);
    return passed;
}

async function runTests() {
    console.log('\n🧪 CodeSensei Backend Tests\n');
    console.log('━'.repeat(50));

    let passed = 0;
    let failed = 0;

    // Test 1: Health check
    try {
        const res = await request('GET', '/health');
        if (log('Health Check', res.status === 200, `status=${res.status}`)) {
            passed++;
        } else {
            failed++;
        }
    } catch (e) {
        log('Health Check', false, `Server not running: ${e.message}`);
        console.log('\n⚠️  Start the server first: npm start\n');
        process.exit(1);
    }

    // Test 2: Status endpoint
    try {
        const res = await request('GET', '/api/status');
        if (log('Status Endpoint', res.status === 200 && res.data.index)) {
            passed++;
        } else {
            failed++;
        }
    } catch (e) {
        log('Status Endpoint', false, e.message);
        failed++;
    }

    // Test 3: Index endpoint (with sample data)
    try {
        const res = await request('POST', '/api/index', {
            projectId: 'test-project',
            files: [
                { path: 'test.js', content: 'function hello() { return "world"; }' },
                { path: 'utils.js', content: 'const add = (a, b) => a + b;\nmodule.exports = { add };' }
            ]
        });
        if (log('Index Endpoint', res.status === 200 && res.data.success !== false)) {
            passed++;
        } else {
            failed++;
        }
    } catch (e) {
        log('Index Endpoint', false, e.message);
        failed++;
    }

    // Test 4: Ask endpoint (requires Vertex AI)
    try {
        const res = await request('POST', '/api/ask', {
            prompt: 'What does the hello function do?',
            context: [{ path: 'test.js', content: 'function hello() { return "world"; }' }]
        });

        if (res.status === 503) {
            log('Ask Endpoint', false, 'Vertex AI not configured (expected if no GCP_PROJECT_ID)');
            // Don't count as failure if Vertex AI not configured
        } else if (res.status === 200 && res.data.answer) {
            log('Ask Endpoint', true, 'Response received');
            passed++;
        } else {
            log('Ask Endpoint', false, `status=${res.status}`);
            failed++;
        }
    } catch (e) {
        log('Ask Endpoint', false, e.message);
        failed++;
    }

    // Summary
    console.log('\n' + '━'.repeat(50));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(console.error);
