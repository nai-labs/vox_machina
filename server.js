/**
 * VOX MACHINA Server
 * Main entry point for the Express server with WebSocket support
 */
import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import localtunnel from 'localtunnel';
import { WebSocketServer } from 'ws';

// Import modular routes and handlers
import tokenRouter from './server/routes/token.js';
import audioRouter from './server/routes/audio.js';
import { handleGeminiConnection } from './server/websocket/gemini.js';

// Configure ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const port = process.env.PORT || 3000;

// Validate API keys at startup
const openAIApiKey = process.env.OPENAI_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!openAIApiKey) {
  console.warn('⚠️  OPENAI_API_KEY not found. OpenAI functionality will not work.');
} else {
  console.log(`✅ OpenAI API key loaded: ${openAIApiKey.substring(0, 8)}...${openAIApiKey.slice(-4)}`);
  if (!openAIApiKey.startsWith('sk-') || openAIApiKey.length < 20) {
    console.warn('⚠️  OpenAI API key format appears invalid. Expected format: sk-...');
  }
}

if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found. Gemini functionality will not work.');
} else {
  console.log(`✅ Gemini API key loaded: ${geminiApiKey.substring(0, 8)}...${geminiApiKey.slice(-4)}`);
}

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

// Middleware
app.use(express.json({ limit: '50mb' }));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// API Routes
app.use('/token', tokenRouter);
app.use('/save-audio', audioRouter);

// Vite middleware (must be after API routes)
app.use(vite.middlewares);

// Render the React client (catch-all route - must be last)
app.use('*', async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync('./client/index.html', 'utf-8'),
    );
    const { render } = await vite.ssrLoadModule('./client/entry-server.jsx');
    const appHtml = await render(url);
    const html = template.replace('<!--ssr-outlet-->', appHtml?.html);
    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

/**
 * Create a public tunnel using localtunnel
 * @param {number} port - Port to tunnel
 * @returns {Promise<object|null>} Tunnel object or null if failed
 */
async function createTunnel(port) {
  try {
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

    tunnel.on('close', () => console.log('Tunnel closed'));
    tunnel.on('error', (err) => console.error('Tunnel error:', err));

    return tunnel;
  } catch (error) {
    console.error(`Failed to create tunnel: ${error.message}`);

    // Try without custom subdomain
    try {
      console.log('Trying alternative tunnel configuration...');
      const fallbackTunnel = await localtunnel({ port });
      console.log(`🌐 Alternative Public URL: ${fallbackTunnel.url}`);

      fallbackTunnel.on('close', () => console.log('Fallback tunnel closed'));
      fallbackTunnel.on('error', (err) => console.error('Fallback tunnel error:', err));

      return fallbackTunnel;
    } catch (fallbackError) {
      console.error(`Failed to create alternative tunnel: ${fallbackError.message}`);
      console.log('\n===========================================================================');
      console.log('🔴 Failed to create a public URL using localtunnel.');
      console.log(`🟢 Application is running locally at http://localhost:${port}`);
      console.log('===========================================================================\n');
      return null;
    }
  }
}

// Start server
let serverInstance = null;

if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(port, () => {
    console.log(`Express server running on http://localhost:${port}`);

    // Create tunnel for public access
    createTunnel(port);

    // Setup WebSocket server for Gemini
    const wss = new WebSocketServer({ server: serverInstance });

    wss.on('connection', (ws, req) => {
      if (req.url === '/ws/gemini') {
        handleGeminiConnection(ws, geminiApiKey);
      } else {
        console.log(`WebSocket connection attempt to unknown path: ${req.url}`);
        ws.terminate();
      }
    });

    console.log('WebSocket server initialized and attached to HTTP server.');
  });
} else {
  console.log('Running in test mode. Server not started automatically.');
}

// Export for testing
export { app, serverInstance, vite };
