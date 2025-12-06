/**
 * Token route handler for OpenAI Realtime API session creation
 */
import express from 'express';
import { getCharacterPromptById } from '../../server-utils.js';

const router = express.Router();

// Default model if not specified in environment
const DEFAULT_OPENAI_MODEL = 'gpt-realtime';

/**
 * GET /token
 * Generate an ephemeral session token for OpenAI Realtime API
 * 
 * Query parameters:
 * - character: Character ID to use (default: 'default')
 * - temperature: Temperature for the model (default: 0.8)
 * - voice: Voice override (optional, uses character default if not provided)
 */
router.get('/', async (req, res) => {
    const openAIApiKey = process.env.OPENAI_API_KEY;

    if (!openAIApiKey) {
        return res.status(500).json({
            error: 'OpenAI API key not configured',
            message: 'OPENAI_API_KEY environment variable is not set'
        });
    }

    try {
        // Get the character ID and parameters from the query
        const characterId = req.query.character || 'default';
        const temperature = parseFloat(req.query.temperature) || 0.8;
        const voice = req.query.voice || null;

        console.log(`[Token] Received character ID: ${characterId}`);
        console.log(`[Token] Temperature: ${temperature}`);
        console.log(`[Token] Voice override: ${voice || 'none (using character default)'}`);

        // Get the character prompt from characters.json
        const character = getCharacterPromptById(characterId);

        if (!character) {
            console.error(`[Token] Character '${characterId}' not found`);
            return res.status(404).json({ error: `Character '${characterId}' not found` });
        }

        console.log(`[Token] Using character: ${character.name}`);
        console.log(`[Token] Character prompt length: ${character.prompt.length} characters`);

        let apiModel = process.env.OPENAI_API_MODEL;
        if (!apiModel) {
            apiModel = DEFAULT_OPENAI_MODEL;
            console.warn(`[Token] OPENAI_API_MODEL not set. Using default: ${DEFAULT_OPENAI_MODEL}`);
        } else {
            console.log(`[Token] Using OpenAI model: ${apiModel}`);
        }

        const response = await fetch(
            'https://api.openai.com/v1/realtime/sessions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${openAIApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: apiModel,
                    voice: voice || character.voice || 'sage',
                    temperature: temperature,
                    max_response_output_tokens: 4096,
                    instructions: character.prompt,
                }),
            },
        );

        const data = await response.json();

        // Log the response for debugging
        console.log('[Token] OpenAI Realtime Sessions API response:', JSON.stringify(data, null, 2));

        // Check if the response is successful
        if (!response.ok) {
            console.error('[Token] OpenAI API error:', data);

            // Provide specific error messages based on the error type
            let errorMessage = 'OpenAI API request failed';
            if (data.error) {
                if (data.error.code === 'invalid_api_key') {
                    errorMessage = `Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable. Error: ${data.error.message}`;
                } else if (data.error.code === 'insufficient_quota') {
                    errorMessage = `Insufficient quota/credits for OpenAI API. Please add credits to your account. Error: ${data.error.message}`;
                } else if (data.error.code === 'model_not_found') {
                    errorMessage = `Model not found. The Realtime API model may not be available for your account. Error: ${data.error.message}`;
                } else {
                    errorMessage = `OpenAI API error (${data.error.code}): ${data.error.message}`;
                }
            }

            return res.status(response.status).json({
                error: errorMessage,
                openai_error: data.error,
                status_code: response.status
            });
        }

        // Validate the response format
        if (!data.client_secret) {
            console.error('[Token] OpenAI API response missing client_secret:', data);
            return res.status(500).json({
                error: 'OpenAI API response missing client_secret field',
                response_keys: Object.keys(data),
                full_response: data
            });
        }

        // Include the apiModel in the response
        res.json({ ...data, apiModel });
    } catch (error) {
        console.error('[Token] Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

export default router;
