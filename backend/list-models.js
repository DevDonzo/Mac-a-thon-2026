const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

async function listModels() {
    const vertexAI = new VertexAI({
        project: process.env.GCP_PROJECT_ID,
        location: process.env.GCP_LOCATION || 'us-central1',
    });

    console.log('Project:', process.env.GCP_PROJECT_ID);

    // There isn't a direct "list foundation models" in the SDK easily, 
    // but we can try a simple generation with a few names.
    const modelsToTry = [
        'gemini-3-pro-preview',
        'gemini-3-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro'
    ];

    for (const modelName of modelsToTry) {
        try {
            const model = vertexAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('hi');
            console.log(`✅ ${modelName} is AVAILABLE`);
        } catch (e) {
            console.log(`❌ ${modelName} failed: ${e.message.split('\n')[0].substring(0, 100)}`);
        }
    }
}

listModels();
