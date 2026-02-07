/**
 * Backend validation script
 * Run with: node src/validate.js
 */

require('dotenv').config();
const { config, validateConfig } = require('./config');

console.log('\n🔍 CodeSensei Backend Validation\n');
console.log('━'.repeat(50));

// Check environment
console.log('\n📋 Environment Configuration:');
console.log(`   GCP_PROJECT_ID: ${config.gcp.projectId || '❌ NOT SET'}`);
console.log(`   GCP_LOCATION:   ${config.gcp.location}`);
console.log(`   PORT:           ${config.server.port}`);
console.log(`   NODE_ENV:       ${config.server.env}`);

// Validate
console.log('\n✅ Validation:');
const isValid = validateConfig();

if (!isValid) {
    console.log('\n❌ Configuration is INVALID');
    console.log('\nTo fix:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Set GCP_PROJECT_ID to your Google Cloud project');
    console.log('  3. Run: gcloud auth application-default login');
    process.exit(1);
}

// Try to initialize Vertex AI
console.log('\n🤖 Testing Vertex AI Connection...');

const { initializeVertexAI, isReady } = require('./vertexai');

try {
    const success = initializeVertexAI();

    if (success && isReady()) {
        console.log('   ✅ Vertex AI initialized successfully');
    } else {
        console.log('   ⚠️  Vertex AI initialization returned false');
        console.log('      Check your GCP credentials');
    }
} catch (error) {
    console.log(`   ❌ Vertex AI initialization failed: ${error.message}`);
}

console.log('\n' + '━'.repeat(50));
console.log('✅ Validation complete\n');
console.log('To start the server: npm start\n');
