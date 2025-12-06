/**
 * Gemini WebSocket handler for proxying connections to Google's Live API
 */
import WebSocket from 'ws';

/**
 * Sets up Gemini WebSocket connection handling on the given WebSocket connection
 * @param {WebSocket} ws - Client WebSocket connection
 * @param {string} geminiApiKey - Gemini API key
 */
export function handleGeminiConnection(ws, geminiApiKey) {
    if (!geminiApiKey) {
        console.error('[Gemini WS] GEMINI_API_KEY is not set. Closing WebSocket connection.');
        ws.terminate();
        return;
    }

    let googleWs = null; // WebSocket connection from this server to Google
    let clientConfigData = null; // Store initial config from client
    let isGoogleSessionSetupComplete = false; // Track if Google setup is complete
    let modelSpeaking = false; // Track if model is currently speaking to gate mic uplink

    console.log('[Gemini WS] Client connected. Waiting for initial config from client.');

    ws.on('message', async (message) => {
        const messageString = message.toString();
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(messageString);
            console.log('[Gemini WS] Received from client:', parsedMessage);
        } catch (e) {
            console.error('[Gemini WS] Failed to parse message from client (expecting JSON):', messageString, e);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: 'Invalid message format. Expecting JSON.' }));
            }
            return;
        }

        if (parsedMessage.type === 'gemini_config' && !googleWs) {
            clientConfigData = parsedMessage;
            // Use the specified model (can be overridden via clientConfigData if needed)
            const modelForGoogle = parsedMessage.model || 'models/gemini-2.5-flash-native-audio-preview-09-2025';
            const systemPromptForGoogle = clientConfigData.systemPrompt || '';
            // Force AUDIO modality for native audio models
            const responseModalityForGoogle = ['AUDIO'];
            const geminiVoice = clientConfigData.geminiVoice;

            console.log(`[Gemini WS] Using Gemini model: ${modelForGoogle} with AUDIO modality.`);
            if (geminiVoice) console.log(`[Gemini WS] Requested Gemini voice: ${geminiVoice}`);

            const googleWsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

            console.log(`[Gemini WS] Connecting to Google Live API at ${googleWsUrl} with model ${modelForGoogle}`);

            googleWs = new WebSocket(googleWsUrl, {
                headers: {
                    'x-goog-api-key': geminiApiKey
                }
            });

            googleWs.onopen = () => {
                console.log('[Gemini WS] Connection to Google Live API established.');

                const debugText = process.env.GEMINI_DEBUG === '1' || (clientConfigData && clientConfigData.debug === true);
                const responseModalities = debugText ? Array.from(new Set([...responseModalityForGoogle, 'TEXT'])) : responseModalityForGoogle;

                const generationConfig = {
                    responseModalities,
                    maxOutputTokens: 4096,
                };

                if (clientConfigData.temperature !== undefined) {
                    let temp = parseFloat(clientConfigData.temperature);
                    // Clamp temperature to valid range (0.0 - 2.0)
                    temp = Math.min(Math.max(temp, 0.0), 2.0);
                    generationConfig.temperature = temp;
                    console.log(`[Gemini WS] Setting temperature to: ${generationConfig.temperature}`);
                }

                if (responseModalityForGoogle.includes('AUDIO') && geminiVoice) {
                    generationConfig.speechConfig = {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voice_name: geminiVoice }
                        }
                    };
                }

                const setupMessagePayload = {
                    model: modelForGoogle,
                    systemInstruction: {
                        parts: [{ text: systemPromptForGoogle }]
                    },
                    generationConfig: generationConfig,
                    outputAudioTranscription: {}, // Request transcriptions for audio output
                    ...(clientConfigData.safetySettings && { safetySettings: clientConfigData.safetySettings })
                };

                const setupMessage = { setup: setupMessagePayload };

                console.log('[Gemini WS] Sending BidiGenerateContentSetup to Google:', JSON.stringify(setupMessage, null, 2));
                googleWs.send(JSON.stringify(setupMessage));
            };

            googleWs.onmessage = (event) => {
                const googleMsgString = event.data.toString();
                console.log('[Gemini WS] Received message from Google Live API:', googleMsgString);
                try {
                    const googleMsg = JSON.parse(googleMsgString);

                    // Forward usage metadata to client for debugging/telemetry
                    if (googleMsg.usageMetadata) {
                        console.log('[Gemini WS] Usage:', JSON.stringify(googleMsg.usageMetadata));
                        if (typeof googleMsg.usageMetadata.responseTokenCount !== 'undefined') {
                            console.log(`[Gemini WS] responseTokenCount: ${googleMsg.usageMetadata.responseTokenCount}`);
                        }
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'gemini_usage', usage: googleMsg.usageMetadata }));
                        }
                    }

                    if (googleMsg.setupComplete) {
                        console.log('[Gemini WS] Google Live API setup complete.');
                        isGoogleSessionSetupComplete = true;
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ status: 'Gemini session initialized (via direct WebSocket)' }));
                        }
                    } else if (googleMsg.serverContent) {
                        handleServerContent(googleMsg.serverContent, ws, modelSpeaking, (speaking) => {
                            modelSpeaking = speaking;
                        });
                    } else {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'google_raw_message', data: googleMsg }));
                        }
                    }
                } catch (e) {
                    console.error('[Gemini WS] Error parsing message from Google or forwarding to client:', e);
                }
            };

            googleWs.onerror = (error) => {
                console.error('[Gemini WS] Error on WebSocket connection to Google Live API:', error.message);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ error: `Google WebSocket error: ${error.message}` }));
                }
                if (googleWs) googleWs.terminate();
                googleWs = null;
            };

            googleWs.onclose = (event) => {
                console.log('[Gemini WS] WebSocket connection to Google Live API closed:', event.code, event.reason);
                isGoogleSessionSetupComplete = false;
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ status: 'Gemini session with Google closed.', code: event.code, reason: event.reason }));
                }
                googleWs = null;
            };

        } else if ((parsedMessage.type === 'user_text_input' || parsedMessage.type === 'user_audio_input')) {
            if (googleWs && googleWs.readyState === WebSocket.OPEN && isGoogleSessionSetupComplete) {
                if (parsedMessage.type === 'user_text_input') {
                    const clientContentMessage = {
                        clientContent: {
                            turns: [{ role: 'user', parts: [{ text: parsedMessage.text }] }],
                            turnComplete: true
                        }
                    };
                    console.log('[Gemini WS] Sending clientContent (text) to Google:', JSON.stringify(clientContentMessage));
                    googleWs.send(JSON.stringify(clientContentMessage));
                } else if (parsedMessage.type === 'user_audio_input' && parsedMessage.data) {
                    console.log('[Gemini WS] Received user_audio_input chunk from client. Data length (base64):', parsedMessage.data.length);
                    if (!modelSpeaking) {
                        const googleAudioMessage = {
                            realtimeInput: {
                                audio: {
                                    mimeType: 'audio/pcm;rate=16000',
                                    data: parsedMessage.data
                                }
                            }
                        };
                        googleWs.send(JSON.stringify(googleAudioMessage));
                    } else {
                        // Drop uplink audio while model is speaking to avoid VAD-based interruption
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'gemini_uplink_dropped', reason: 'model_speaking' }));
                        }
                    }
                }
            } else {
                console.warn(`[Gemini WS] Received ${parsedMessage.type} but Google session not fully ready. googleWs state: ${googleWs?.readyState}, setupComplete: ${isGoogleSessionSetupComplete}`);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ error: 'Google session not fully initialized yet. Please wait a moment and retry.' }));
                }
            }
        } else if (!googleWs) {
            console.warn(`[Gemini WS] Received ${parsedMessage.type} before Google WebSocket session was even attempted (no config received?).`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: 'Gemini session with Google not ready. Initial config not yet processed by server.' }));
            }
        } else {
            console.warn('[Gemini WS] Unknown message type from client or Google WebSocket not open:', parsedMessage.type);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: `Unknown message type: ${parsedMessage.type} or Google WS not open.` }));
            }
        }
    });

    ws.on('close', () => {
        console.log('[Gemini WS] Client disconnected.');
        if (googleWs) {
            googleWs.terminate();
            googleWs = null;
            console.log('[Gemini WS] Terminated connection to Google Live API due to client disconnect.');
        }
    });

    ws.on('error', (error) => {
        console.error('[Gemini WS] Client WebSocket error:', error);
        if (googleWs) {
            googleWs.terminate();
            googleWs = null;
            console.log('[Gemini WS] Terminated connection to Google Live API due to client WebSocket error.');
        }
    });
}

/**
 * Handle serverContent messages from Google
 * @param {object} serverContent - The serverContent object from Google
 * @param {WebSocket} ws - Client WebSocket connection
 * @param {boolean} modelSpeaking - Whether the model is currently speaking
 * @param {function} setModelSpeaking - Callback to update modelSpeaking state
 */
function handleServerContent(serverContent, ws, modelSpeaking, setModelSpeaking) {
    // Safety/finish diagnostics
    if (typeof serverContent.finishReason !== 'undefined' || typeof serverContent.stopReason !== 'undefined') {
        console.log('[Gemini WS] finishReason:', serverContent.finishReason, 'stopReason:', serverContent.stopReason);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_finish', finishReason: serverContent.finishReason, stopReason: serverContent.stopReason }));
        }
    }

    if (serverContent.safetyRatings) {
        console.log('[Gemini WS] safetyRatings:', JSON.stringify(serverContent.safetyRatings));
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_safety', safetyRatings: serverContent.safetyRatings }));
        }
    }

    // Handle output transcription
    if (serverContent.outputTranscription && serverContent.outputTranscription.text) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_transcription', text: serverContent.outputTranscription.text }));
        }
    }

    // Handle model turn text
    if (serverContent.modelTurn && serverContent.modelTurn.parts) {
        const textPart = serverContent.modelTurn.parts.find(p => p.text);
        if (textPart && textPart.text) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'gemini_text_chunk', text: textPart.text }));
            }
        }

        // Handle audio data
        const audioPart = serverContent.modelTurn.parts.find(p =>
            p.inlineData &&
            typeof p.inlineData.mimeType === 'string' &&
            p.inlineData.mimeType.startsWith('audio/pcm')
        );
        if (audioPart && audioPart.inlineData.data) {
            console.log('[Gemini WS] Received audio data chunk from Google, forwarding to client. MimeType:', audioPart.inlineData.mimeType, 'Data length (base64):', audioPart.inlineData.data.length);
            setModelSpeaking(true);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'gemini_audio_chunk', data: audioPart.inlineData.data }));
            }
        }
    }

    if (serverContent.interrupted) {
        setModelSpeaking(false);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_interrupted' }));
        }
    }

    if (serverContent.generationComplete) {
        setModelSpeaking(false);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_generation_complete' }));
        }
    }

    if (serverContent.turnComplete) {
        setModelSpeaking(false);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'gemini_turn_complete' }));
        }
    }
}

export default { handleGeminiConnection };
