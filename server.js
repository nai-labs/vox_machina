import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import localtunnel from "localtunnel";
import { WebSocketServer } from "ws"; // For creating the server
import WebSocket from 'ws'; // For creating a WebSocket client connection
import { GoogleGenerativeAI } from "@google/generative-ai"; // Added for Gemini (though direct WS might not use it)
import { getCharacterPromptById } from "./server-utils.js";

// Configure ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const port = process.env.PORT || 3000;
const openAIApiKey = process.env.OPENAI_API_KEY; // Renamed for clarity
const geminiApiKey = process.env.GEMINI_API_KEY; // Added for Gemini

const DEFAULT_OPENAI_MODEL = "gpt-4o-realtime-preview-2024-12-17";
// TODO: Define default Gemini model
// const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-live-001"; // Example from PDF

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(express.json({ limit: '50mb' }));

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// API route for token generation
app.get("/token", async (req, res) => {
  try {
    // Get the character ID and parameters from the query
    const characterId = req.query.character || 'default';
    const temperature = parseFloat(req.query.temperature) || 0.8;
    const voice = req.query.voice || null;
    
    console.log(`Received character ID: ${characterId}`);
    console.log(`Temperature: ${temperature}`);
    console.log(`Voice override: ${voice || 'none (using character default)'}`);
    
    // Get the character prompt from characters.json
    const character = getCharacterPromptById(characterId);
    
    if (!character) {
      console.error(`Character '${characterId}' not found`);
      return res.status(404).json({ error: `Character '${characterId}' not found` });
    }
    
    console.log(`Using character: ${character.name}`);
    console.log(`Character prompt length: ${character.prompt.length} characters`);
    
    let apiModel = process.env.OPENAI_API_MODEL;
    if (!apiModel) {
      apiModel = DEFAULT_OPENAI_MODEL;
      console.warn(`OPENAI_API_MODEL environment variable not set. Using default model: ${DEFAULT_OPENAI_MODEL}`);
    } else {
      console.log(`Using OpenAI model from environment variable: ${apiModel}`);
    }
    
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: apiModel,
          voice: voice || character.voice || "sage",
          temperature: temperature,
          max_response_output_tokens: 4096,
          instructions: character.prompt,
        }),
      },
    );

    const data = await response.json();
    // Include the apiModel in the response
    res.json({ ...data, apiModel });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Endpoint to save audio data as webm
app.post("/save-audio", async (req, res) => {
  try {
    console.log("Received save-audio request");
    const { audioData, isRecentMessage, exportType, character } = req.body;
    
    // Create outputs directory if it doesn't exist
    const outputsDir = path.join(process.cwd(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
      console.log("Created outputs directory:", outputsDir);
    }
    
    // Create timestamp for filenames (more readable format)
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const timestamp = `${date}_${time}`;
    
    // Handle the audio export
    if (!audioData) {
      console.log("No audio data provided in request");
      return res.status(400).json({ error: "No audio data provided" });
    }
    
    console.log("Audio data received, size:", audioData.length);
    console.log("Export type:", exportType || "standard");
    console.log("Character:", character ? character.name : "unknown");
    console.log("Is recent message only:", isRecentMessage ? "yes" : "no");
    
    // Ensure the data is properly formatted
    let base64Data = audioData;
    if (base64Data.indexOf('base64,') > -1) {
      base64Data = base64Data.split('base64,')[1];
    }
    
    // Convert base64 data to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    console.log("Buffer created, size:", buffer.length);
    
    // Create descriptive filename
    let characterName = 'unknown-character';
    if (character && character.name) {
      // Clean character name for filename safety
      characterName = character.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }
    
    let exportTypeLabel;
    if (exportType === 'last') {
      exportTypeLabel = 'last-response';
    } else if (exportType === 'full') {
      exportTypeLabel = 'full-conversation';
    } else {
      exportTypeLabel = isRecentMessage ? 'recent-message' : 'ai-audio';
    }
    
    const filename = `vox-machina_${characterName}_${exportTypeLabel}_${timestamp}.webm`;
    const filePath = path.join(outputsDir, filename);
    
    // Write webm file to disk
    fs.writeFileSync(filePath, buffer);
    console.log("Webm file saved to:", filePath);
    
    // Create mp3 filename
    const mp3Filename = `vox-machina_${characterName}_${exportTypeLabel}_${timestamp}.mp3`;
    const mp3FilePath = path.join(outputsDir, mp3Filename);
    
    // Convert webm to mp3 using ffmpeg with silence removal
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .output(mp3FilePath)
        .audioFilters('silenceremove=stop_periods=-1:stop_threshold=-50dB:stop_duration=1:start_threshold=-50dB:start_duration=0.1')
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', () => {
          console.log('MP3 conversion finished with silence removal:', mp3FilePath);
          resolve();
        })
        .on('error', (err) => {
          console.error('MP3 conversion error:', err);
          reject(err);
        })
        .run();
    });
    
    res.json({ 
      success: true, 
      message: "Audio saved successfully", 
      webm: {
        filename,
        path: filePath
      },
      mp3: {
        filename: mp3Filename,
        path: mp3FilePath
      }
    });
  } catch (error) {
    console.error("Error saving audio:", error);
    res.status(500).json({ error: `Failed to save audio file: ${error.message}` });
  }
});

// Vite middleware must be added after the API routes
app.use(vite.middlewares);

// Render the React client - this should be the last route
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

// Create tunnel to make the server publicly accessible
async function createTunnel(port) {
  try {
    // Generate a unique subdomain based on a timestamp
    const subdomain = `app-${Date.now().toString().slice(-6)}`;
    
    console.log(`Attempting to create tunnel with subdomain: ${subdomain}`);
    
    const tunnel = await localtunnel({ 
      port,
      subdomain: subdomain,
      allow_ip: ['0.0.0.0/0']
    });
    
    console.log(`🌐 Public URL: ${tunnel.url}`);
    console.log(`Subdomain: ${subdomain}`);
    console.log(`Share this URL with others to access your application`);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });
    
    tunnel.on('error', (err) => {
      console.error('Tunnel error (after connection):', err);
    });

    return tunnel;
  } catch (error) {
    console.error(`Failed to create tunnel with subdomain: ${error.message}`);
    
    console.log('Trying alternative tunnel configuration (without custom subdomain)...');
    try {
      const fallbackTunnel = await localtunnel({ port });
      console.log(`🌐 Alternative Public URL: ${fallbackTunnel.url}`);
      console.log(`Share this URL with others to access your application`);
      
      fallbackTunnel.on('close', () => {
        console.log('Fallback tunnel closed');
      });
      
      fallbackTunnel.on('error', (err) => {
        console.error('Fallback tunnel error (after connection):', err);
      });

      return fallbackTunnel;
    } catch (fallbackError) {
      console.error(`Failed to create alternative tunnel: ${fallbackError.message}`);
      console.log("\n===========================================================================");
      console.log("🔴 Failed to create a public URL using localtunnel.");
      console.log(`🟢 Application is running locally. Access it at http://localhost:${port}`);
      console.log("===========================================================================\n");
      return null;
    }
  }
}

// Start server
let serverInstance = null;

if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(port, () => {
    console.log(`Express server running on http://localhost:${port}`);
    
    // Create tunnel in production mode
    createTunnel(port);

    // Setup WebSocket server for Gemini
    const wss = new WebSocketServer({ server: serverInstance }); // Attach to existing HTTP server

    wss.on('connection', (ws, req) => {
      if (req.url === '/ws/gemini') {
        console.log('Client connected to /ws/gemini');

        if (!geminiApiKey) {
          console.error('GEMINI_API_KEY is not set. Closing WebSocket connection.');
          ws.terminate();
          return;
        }

        // Removed GoogleGenerativeAI SDK instantiation here as we're using direct WebSocket for Live API
        // const genAI = new GoogleGenerativeAI(geminiApiKey);
        // const WebSocket = WebSocketServer.WebSocket; // This was incorrect

        let googleWs = null; // WebSocket connection from this server to Google
        let clientConfigData = null; // Store initial config from client
        let isGoogleSessionSetupComplete = false; // Track if Google setup is complete

        console.log('Client connected to /ws/gemini. Waiting for initial config from client.');

        ws.on('message', async (message) => {
          const messageString = message.toString();
          let parsedMessage;
          try {
            parsedMessage = JSON.parse(messageString);
            console.log('Received from client for /ws/gemini:', parsedMessage);
          } catch (e) {
            console.error('Failed to parse message from client (expecting JSON):', messageString, e);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ error: 'Invalid message format. Expecting JSON.' }));
            }
            return;
          }

          if (parsedMessage.type === 'gemini_config' && !googleWs) {
            clientConfigData = parsedMessage; 
            // Force the specific model requested by the user
            const modelForGoogle = 'models/gemini-2.5-flash-exp-native-audio-thinking-dialog'; 
            // gemini-2.5-flash-preview-native-audio-dialog 
            // gemini-2.5-flash-exp-native-audio-thinking-dialog
            const systemPromptForGoogle = clientConfigData.systemPrompt || "";
            // Force AUDIO modality as per user's model choice constraint
            const responseModalityForGoogle = ["AUDIO"]; 
            const geminiVoice = clientConfigData.geminiVoice;

            console.log(`Using Gemini model: ${modelForGoogle} with AUDIO modality.`);
            if (geminiVoice) console.log(`Requested Gemini voice: ${geminiVoice}`);

            const googleWsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
            
            console.log(`Attempting to connect to Google Live API at ${googleWsUrl} with model ${modelForGoogle}`);

            // For direct WebSocket, API key is usually sent as a header.
            // The 'ws' library allows specifying headers during connection.
            googleWs = new WebSocket(googleWsUrl, {
              headers: {
                'x-goog-api-key': geminiApiKey 
                // Note: If this doesn't work, Google might require an ephemeral AuthToken via Authorization: Token <token>
                // This would involve an extra step to call AuthTokenService.CreateToken first.
              }
            });

            googleWs.onopen = () => {
              console.log('Connection to Google Live API established.');
              
              const generationConfig = {
                responseModalities: responseModalityForGoogle,
              };

              if (clientConfigData.temperature !== undefined) {
                let temp = parseFloat(clientConfigData.temperature);
                // Sanity clamp, though UI should send valid values for the provider.
                // Assuming Gemini's max is 2.0 as per user.
                temp = Math.min(Math.max(temp, 0.0), 2.0); 
                generationConfig.temperature = temp;
                console.log(`[Server] Setting Gemini temperature to: ${generationConfig.temperature}`);
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
                outputAudioTranscription: {} // Requesting transcriptions for the audio output
                // TODO: Add tools, realtimeInputConfig, etc. as needed from clientConfigData
              };

              const setupMessage = { setup: setupMessagePayload };
              
              console.log('Sending BidiGenerateContentSetup to Google:', JSON.stringify(setupMessage, null, 2));
              googleWs.send(JSON.stringify(setupMessage));
            };

            googleWs.onmessage = (event) => {
              const googleMsgString = event.data.toString();
              console.log('Received message from Google Live API:', googleMsgString);
              try {
                const googleMsg = JSON.parse(googleMsgString);
                if (googleMsg.setupComplete) {
                  console.log('Google Live API setup complete.');
                  isGoogleSessionSetupComplete = true; // Set flag
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ status: 'Gemini session initialized (via direct WebSocket)' }));
                  }
                } else if (googleMsg.serverContent) {
                  // Handle output transcription
                  if (googleMsg.serverContent.outputTranscription && googleMsg.serverContent.outputTranscription.text) {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'gemini_transcription', text: googleMsg.serverContent.outputTranscription.text }));
                    }
                  }
                  // Handle model turn text (might be present even with audio, e.g., for function calls or errors)
                  if (googleMsg.serverContent.modelTurn && googleMsg.serverContent.modelTurn.parts) {
                    const textPart = googleMsg.serverContent.modelTurn.parts.find(p => p.text);
                    if (textPart && textPart.text) {
                       if (ws.readyState === WebSocket.OPEN) {
                         ws.send(JSON.stringify({ type: 'gemini_text_chunk', text: textPart.text }));
                       }
                    }
                    // Handle audio data from googleMsg.serverContent.modelTurn.parts
                    const audioPart = googleMsg.serverContent.modelTurn.parts.find(p => 
                        p.inlineData && 
                        typeof p.inlineData.mimeType === 'string' && 
                        p.inlineData.mimeType.startsWith('audio/pcm') // Corrected MimeType Check
                    );
                    if (audioPart && audioPart.inlineData.data) {
                        console.log('Received audio data chunk from Google, forwarding to client. MimeType:', audioPart.inlineData.mimeType, 'Data length (base64):', audioPart.inlineData.data.length);
                        if (ws.readyState === WebSocket.OPEN) {
                           ws.send(JSON.stringify({ type: 'gemini_audio_chunk', data: audioPart.inlineData.data /* This should be a base64 string */ }));
                        }
                    }
                  }

                  if (googleMsg.serverContent.generationComplete) {
                     if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'gemini_generation_complete' }));
                     }
                  }
                  // TODO: Handle tool calls, errors, etc.
                } else {
                   if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'google_raw_message', data: googleMsg }));
                   }
                }
              } catch (e) {
                console.error('Error parsing message from Google or forwarding to client:', e);
              }
            };

            googleWs.onerror = (error) => {
              console.error('Error on WebSocket connection to Google Live API:', error.message);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: `Google WebSocket error: ${error.message}` }));
              }
              if (googleWs) googleWs.terminate();
              googleWs = null;
            };

            googleWs.onclose = (event) => {
              console.log('WebSocket connection to Google Live API closed:', event.code, event.reason);
              isGoogleSessionSetupComplete = false; // Reset flag
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
                    turns: [{ role: "user", parts: [{ text: parsedMessage.text }] }],
                    turnComplete: true 
                  }
                };
                console.log('[Server] Sending clientContent (text) to Google:', JSON.stringify(clientContentMessage));
                googleWs.send(JSON.stringify(clientContentMessage));
              } else if (parsedMessage.type === 'user_audio_input' && parsedMessage.data) {
                console.log('[Server] Received user_audio_input chunk from client. Data length (base64):', parsedMessage.data.length);
                const googleAudioMessage = {
                  realtimeInput: {
                    audio: {
                      mimeType: "audio/pcm;rate=16000", 
                      data: parsedMessage.data 
                    }
                  }
                };
                googleWs.send(JSON.stringify(googleAudioMessage));
              }
            } else {
              console.warn(`[Server] Received ${parsedMessage.type} but Google session not fully ready. googleWs state: ${googleWs?.readyState}, setupComplete: ${isGoogleSessionSetupComplete}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: 'Google session not fully initialized yet. Please wait a moment and retry.' }));
              }
            }
          } else if (!googleWs) { // Fallback for other message types if googleWs is not even initiated
            console.warn(`[Server] Received ${parsedMessage.type} before Google WebSocket session was even attempted (no config received?).`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ error: 'Gemini session with Google not ready. Initial config not yet processed by server.' }));
            }
          } else {
            console.warn('Unknown message type from client or Google WebSocket not open:', parsedMessage.type);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ error: `Unknown message type: ${parsedMessage.type} or Google WS not open.` }));
            }
          }
        });

        ws.on('close', () => {
          console.log('Client disconnected from /ws/gemini');
          if (googleWs) {
            googleWs.terminate();
            googleWs = null;
            console.log('Terminated connection to Google Live API due to client disconnect.');
          }
        });

        ws.on('error', (error) => {
          console.error('Client WebSocket error on /ws/gemini:', error);
          if (googleWs) {
            googleWs.terminate();
            googleWs = null;
            console.log('Terminated connection to Google Live API due to client WebSocket error.');
          }
        });

      } else {
        console.log(`WebSocket connection attempt to unknown path: ${req.url}`);
        ws.terminate();
      }
    });
    console.log(`WebSocket server initialized and attached to HTTP server.`);

  });
} else {
  console.log("Running in test mode. Server not started automatically.");
}

// Export app for testing purposes
export { app, serverInstance, vite };
