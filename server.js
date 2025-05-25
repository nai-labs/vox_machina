import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import localtunnel from "localtunnel";
import { WebSocketServer } from "ws"; // Added for WebSocket
import { GoogleGenerativeAI } from "@google/generative-ai"; // Added for Gemini
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

        // Initialize GoogleGenerativeAI
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let geminiSession = null; // To store the active Gemini Live API session
        let clientWantsAudio = false; // Determined by client's initial config

        console.log('Client connected to /ws/gemini. Waiting for initial config.');

        ws.on('message', async (message) => {
          const messageString = message.toString();
          console.log('Received from client for /ws/gemini:', messageString);

          if (!geminiSession) {
            // Expecting the first message to be a configuration object
            try {
              const clientConfig = JSON.parse(messageString);
              console.log('Received client config for Gemini:', clientConfig);

              // TODO: Validate clientConfig and extract necessary parameters
              // For now, assume clientConfig contains { characterId, responseModality: 'TEXT' | 'AUDIO', ... }
              // const character = getCharacterPromptById(clientConfig.characterId || 'default');
              // if (!character) {
              //   ws.send(JSON.stringify({ error: 'Character not found' }));
              //   ws.terminate();
              //   return;
              // }

              // clientWantsAudio = clientConfig.responseModality === 'AUDIO';
              
              // const geminiModelName = clientConfig.model || "gemini-2.0-flash-live-001"; // Or from character config
              // const geminiSdkConfig = {
              //   response_modalities: [clientConfig.responseModality || "TEXT"],
              //   system_instruction: { parts: [{ text: character.prompt }] },
              //   // TODO: Add speech_config, tool_config etc. based on clientConfig and PDF
              // };

              // console.log(`Attempting to connect to Gemini Live API with model: ${geminiModelName}`);
              // console.log(`Gemini SDK Config:`, geminiSdkConfig);

              // This is a conceptual placeholder based on Python SDK.
              // The actual JS SDK usage for Live API needs to be verified.
              // It might be `genAI.getGenerativeModel({ model: geminiModelName }).startChat()`
              // or a more specific method for Live API if available.
              // For now, we'll simulate the connection setup.
              
              // Placeholder: Assume connection is successful and store a mock session
              geminiSession = {
                send: async (data) => console.log(`[MOCK Gemini] Would send to Gemini: ${data}`),
                close: () => console.log('[MOCK Gemini] Session closed'),
                // In a real scenario, this would be the SDK's session object
              };
              console.log('Mock Gemini session established.');
              ws.send(JSON.stringify({ status: 'Gemini session initialized (mock)' }));

              // TODO: If using the actual SDK, set up listeners for Gemini responses here
              // and forward them to `ws.send()`

            } catch (e) {
              console.error('Failed to parse client config or setup Gemini session:', e);
              ws.send(JSON.stringify({ error: 'Invalid initial configuration for Gemini session.' }));
              ws.terminate();
            }
          } else {
            // Forward subsequent messages to the active Gemini session
            try {
              // Assuming message is text for now. Audio would need different handling.
              // await geminiSession.send(messageString); // Conceptual
              console.log(`[MOCK Gemini] Forwarding to Gemini: ${messageString}`);
              // Simulate Gemini echoing back for now
              ws.send(JSON.stringify({ type: 'gemini_response', text: `Gemini echo: ${messageString}` }));
            } catch (error) {
              console.error('Error forwarding message to Gemini or processing response:', error);
              ws.send(JSON.stringify({ error: 'Failed to communicate with Gemini.' }));
            }
          }
        });

        ws.on('close', () => {
          console.log('Client disconnected from /ws/gemini');
          if (geminiSession) {
            // geminiSession.close(); // Conceptual: Close the connection to Gemini API
            console.log('[MOCK Gemini] Closing Gemini session due to client disconnect.');
            geminiSession = null;
          }
        });

        ws.on('error', (error) => {
          console.error('WebSocket error on /ws/gemini:', error);
          if (geminiSession) {
            // geminiSession.close(); // Conceptual
            console.log('[MOCK Gemini] Closing Gemini session due to WebSocket error.');
            geminiSession = null;
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
