const axios = require('axios');
const FormData = require('form-data');
const { config } = require('./config');
const logger = require('./logger');

const BACKBOARD_BASE_URL = 'https://app.backboard.io/api';

/**
 * Backboard.io Integration Wrapper
 * Refactored to match official V1.0.0 API Spec
 */
class BackboardClient {
    constructor() {
        this.apiKey = config.backboard.apiKey;
    }

    /**
     * Send a message to a Backboard thread
     * @param {string} prompt - The user's query
     * @param {string} threadId - The existing thread ID
     */
    async sendMessage(prompt, threadId = null) {
        if (!this.apiKey) {
            throw new Error('BACKBOARD_API_KEY is not configured');
        }

        // Auto-create thread if missing
        let activeThreadId = threadId;
        if (!activeThreadId) {
            logger.info('No threadId provided, auto-creating one...');
            activeThreadId = await this.createThread();
            if (!activeThreadId) throw new Error('Failed to auto-create Backboard thread');
        }

        try {
            const form = new FormData();
            form.append('content', prompt);
            form.append('llm_provider', 'google');
            form.append('model_name', config.models.generative);
            form.append('memory', 'Auto');
            form.append('stream', 'false');

            const response = await axios.post(`${BACKBOARD_BASE_URL}/threads/${activeThreadId}/messages`, form, {
                headers: {
                    ...form.getHeaders(),
                    'X-API-Key': this.apiKey
                }
            });

            // Spec says response contains 'content' for the assistant's reply
            return {
                answer: response.data.content,
                threadId: activeThreadId,
                messageId: response.data.message_id
            };
        } catch (error) {
            logger.error('Backboard API message error', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    /**
     * Create a new persistent thread for a specific assistant
     */
    async createThread() {
        if (!this.apiKey || !config.backboard.assistantId) {
            logger.error('Backboard configuration missing for thread creation');
            return null;
        }

        try {
            const response = await axios.post(
                `${BACKBOARD_BASE_URL}/assistants/${config.backboard.assistantId}/threads`,
                {},
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Spec says response contains 'thread_id'
            return response.data.thread_id;
        } catch (error) {
            logger.error('Failed to create Backboard thread', {
                error: error.message,
                data: error.response?.data
            });
            return null;
        }
    }
}

module.exports = new BackboardClient();
