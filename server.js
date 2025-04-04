import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import localtunnel from "localtunnel";
import { getCharacterPromptById } from "./server-utils.js";

// Configure ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

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
    
    // Get the character prompt from chars.md
    const character = getCharacterPromptById(characterId);
    
    if (!character) {
      console.error(`Character '${characterId}' not found`);
      return res.status(404).json({ error: `Character '${characterId}' not found` });
    }
    
    console.log(`Using character: ${character.title}`);
    console.log(`Character prompt length: ${character.prompt.length} characters`);
    
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: voice || character.voice || "sage",
          temperature: temperature,
          max_response_output_tokens: 4096,
          instructions: character.prompt,
        }),
      },
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Endpoint to save audio data as webm
app.post("/save-audio", async (req, res) => {
  try {
    console.log("Received save-audio request");
    const { audioData, isRecentMessage, exportType } = req.body;
    
    // Create outputs directory if it doesn't exist
    const outputsDir = path.join(process.cwd(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
      console.log("Created outputs directory:", outputsDir);
    }
    
    // Create timestamp for filenames
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    // Handle the audio export
    if (!audioData) {
      console.log("No audio data provided in request");
      return res.status(400).json({ error: "No audio data provided" });
    }
    
    console.log("Audio data received, size:", audioData.length);
    console.log("Export type:", exportType || "standard");
    console.log("Is recent message only:", isRecentMessage ? "yes" : "no");
    
    // Ensure the data is properly formatted
    let base64Data = audioData;
    if (base64Data.indexOf('base64,') > -1) {
      base64Data = base64Data.split('base64,')[1];
    }
    
    // Convert base64 data to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    console.log("Buffer created, size:", buffer.length);
    
    // Create filename with timestamp and type indicator
    let filePrefix;
    if (exportType === 'last') {
      filePrefix = 'last-response-';
    } else if (exportType === 'full') {
      filePrefix = 'full-conversation-';
    } else {
      filePrefix = isRecentMessage ? 'recent-message-' : 'ai-audio-';
    }
    
    const filename = `${filePrefix}${timestamp}.webm`;
    const filePath = path.join(outputsDir, filename);
    
    // Write webm file to disk
    fs.writeFileSync(filePath, buffer);
    console.log("Webm file saved to:", filePath);
    
    // Create mp3 filename
    const mp3Filename = `${filePrefix}${timestamp}.mp3`;
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

const server = app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
  
  // Create a tunnel to make the server publicly accessible
  (async () => {
    try {
      // Generate a unique subdomain based on a timestamp
      const subdomain = `app-${Date.now().toString().slice(-6)}`;
      
      console.log(`Attempting to create tunnel with subdomain: ${subdomain}`);
      
      const tunnel = await localtunnel({ 
        port,
        subdomain: subdomain,
        allow_ip: ['0.0.0.0/0']  // Try to allow all IPs
      });
      
      console.log(`🌐 Public URL: ${tunnel.url}`);
      console.log(`Subdomain: ${subdomain}`);
      console.log(`Share this URL with others to access your application`);
      
      tunnel.on('close', () => {
        console.log('Tunnel closed');
      });
      
      // Handle errors
      tunnel.on('error', (err) => {
        console.error('Tunnel error:', err);
      });
    } catch (error) {
      console.error('Failed to create tunnel:', error);
      console.error('Error details:', error.message);
      
      // If the first attempt fails, try again without custom options
      try {
        console.log('Trying alternative tunnel configuration...');
        const tunnel = await localtunnel({ port });
        console.log(`🌐 Alternative Public URL: ${tunnel.url}`);
        
        tunnel.on('close', () => {
          console.log('Tunnel closed');
        });
        
        tunnel.on('error', (err) => {
          console.error('Tunnel error:', err);
        });
      } catch (fallbackError) {
        console.error('Failed to create alternative tunnel:', fallbackError.message);
      }
    }
  })();
});
