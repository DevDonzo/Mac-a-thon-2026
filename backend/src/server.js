const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { askSensei, generateArchitectureMap } = require('./ai');

const app = express();
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'CodeSensei Backend' });
});

/**
 * Main AI Query Endpoint
 */
app.post('/api/ask', async (req, res) => {
    try {
        const { prompt, context } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const answer = await askSensei(prompt, context);
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get answer from CodeSensei' });
    }
});

/**
 * Architecture Mapping Endpoint
 */
app.post('/api/architecture', async (req, res) => {
    try {
        const { files } = req.body;
        if (!files) return res.status(400).json({ error: 'Files are required' });

        const diagram = await generateArchitectureMap(files);
        res.json({ diagram });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate architecture map' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CodeSensei Backend running on http://localhost:${PORT}`);
});
