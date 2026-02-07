const { VertexAI } = require('@google-cloud/vertexai');
const { findRelevantContext, generativeModel } = require('./embeddings');
const { SYSTEM_PROMPT, MERMAID_PROMPT } = require('./constants');
const vectorStore = require('./vectorStore');
require('dotenv').config();

/**
 * RAG-powered query: finds relevant context from indexed project, then asks Gemini
 */
async function askSenseiWithRAG(prompt, currentFile = null) {
    try {
        // Step 1: Find relevant context from the indexed project
        let relevantChunks = [];
        const stats = vectorStore.getStats();

        if (stats.totalChunks > 0) {
            if (stats.hasEmbeddings) {
                // Use semantic search with embeddings
                relevantChunks = await findRelevantContext(prompt, vectorStore.getAllChunks(), 5);
            } else {
                // Fallback to keyword search
                relevantChunks = vectorStore.keywordSearch(prompt, 5);
            }
        }

        // Step 2: Build context from retrieved chunks
        const retrievedContext = relevantChunks.map(chunk =>
            `--- Retrieved from ${chunk.path} (relevance: ${(chunk.score * 100).toFixed(1)}%) ---\n${chunk.text}`
        ).join('\n\n');

        // Step 3: Include current file if provided
        const currentFileContext = currentFile
            ? `\n\n--- Currently Active File: ${currentFile.path} ---\n${currentFile.content}`
            : '';

        // Step 4: Build the full prompt with RAG context
        const fullPrompt = `
${SYSTEM_PROMPT}

PROJECT CONTEXT (Retrieved via RAG):
${retrievedContext || 'No project indexed yet. Analyzing only the provided code.'}

${currentFileContext}

USER QUERY:
${prompt}

Provide a thorough, educational response. Reference specific files and line numbers from the context when relevant.
`;

        // Step 5: Query Gemini with the grounded context
        const result = await generativeModel.generateContent(fullPrompt);
        const response = await result.response;

        return {
            answer: response.candidates[0].content.parts[0].text,
            sourcesUsed: relevantChunks.map(c => ({
                path: c.path,
                lines: `${c.startLine}-${c.endLine}`,
                relevance: (c.score * 100).toFixed(1) + '%'
            }))
        };
    } catch (error) {
        console.error('Error in RAG query:', error);
        throw error;
    }
}

/**
 * Simple query without RAG (for quick responses)
 */
async function askSenseiDirect(prompt, context = []) {
    try {
        const contextStr = context.map(c =>
            `File: ${c.path}\nContent:\n${c.content}`
        ).join('\n\n---\n\n');

        const fullPrompt = `
${SYSTEM_PROMPT}

CONTEXT:
${contextStr}

USER QUERY:
${prompt}
`;

        const result = await generativeModel.generateContent(fullPrompt);
        const response = await result.response;
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error calling Vertex AI:', error);
        throw error;
    }
}

/**
 * Generate architecture diagram in Mermaid format
 */
async function generateArchitectureMap(files) {
    try {
        const fileList = files.map(f => `- ${f.path}`).join('\n');

        const prompt = `
${MERMAID_PROMPT}

PROJECT FILES:
${fileList}

Generate a Mermaid diagram showing the architecture. Focus on relationships between components.
`;

        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error generating architecture map:', error);
        throw error;
    }
}

/**
 * Analyze code for potential issues
 */
async function analyzeCode(code, filePath) {
    const prompt = `
Analyze this code for:
1. Potential bugs and edge cases
2. Security vulnerabilities
3. Performance issues
4. Code style and best practices

File: ${filePath}
Code:
${code}

Provide specific, actionable feedback with line references.
`;

    return askSenseiDirect(prompt, [{ path: filePath, content: code }]);
}

module.exports = {
    askSenseiWithRAG,
    askSenseiDirect,
    generateArchitectureMap,
    analyzeCode
};
