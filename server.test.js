import request from 'supertest';
import { vi } from 'vitest';
import { app, serverInstance, vite } from './server.js';

// Mock dependencies
vi.mock('./server-utils.js', () => ({
  getCharacterPromptById: vi.fn(),
}));

const createMockFfmpegCommandInstance = () => ({
  output: vi.fn().mockReturnThis(),
  audioFilters: vi.fn().mockReturnThis(),
  audioCodec: vi.fn().mockReturnThis(),
  audioBitrate: vi.fn().mockReturnThis(),
  _resolveCb: null,
  _rejectCb: null,
  on: vi.fn(function(event, callback) { 
    if (event === 'end') this._resolveCb = callback;
    else if (event === 'error') this._rejectCb = callback;
    return this;
  }),
  run: vi.fn(function() { 
    // Callbacks will be invoked "synchronously" from the mock's perspective.
    // The promise in server.js will resolve/reject based on these direct calls.
    // The test's use of fake timers and vi.runAllTimersAsync() will handle the async flow.
    if (this._shouldError && this._rejectCb) {
      this._rejectCb(new Error('Mock FFMpeg Error from run'));
    } else if (!this._shouldError && this._resolveCb) {
      this._resolveCb();
    }
  }),
  _shouldError: false,
});

vi.mock('fluent-ffmpeg', () => {
  const mockMainFfmpegFunction = vi.fn(() => createMockFfmpegCommandInstance());
  mockMainFfmpegFunction.setFfmpegPath = vi.fn();
  return { default: mockMainFfmpegFunction };
});

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

let getCharacterPromptByIdMock;
let fsExistsSyncMock, fsMkdirSyncMock, fsWriteFileSyncMock;
let ffmpegMainMock; 

const originalEnv = { ...process.env };
let mockFetch;

describe('Server API Endpoints', () => {

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const serverUtilsModule = await import('./server-utils.js');
    getCharacterPromptByIdMock = serverUtilsModule.getCharacterPromptById;

    const fsModule = await import('fs');
    fsExistsSyncMock = fsModule.existsSync;
    fsMkdirSyncMock = fsModule.mkdirSync;
    fsWriteFileSyncMock = fsModule.writeFileSync;

    const ffmpegModule = await import('fluent-ffmpeg');
    ffmpegMainMock = ffmpegModule.default;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    
    vi.mocked(ffmpegMainMock).mockImplementation(() => createMockFfmpegCommandInstance());
    vi.mocked(ffmpegMainMock.setFfmpegPath).mockImplementation(() => {});

    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.OPENAI_API_MODEL = 'test-model-env';
    global.fetch = mockFetch = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers(); 
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
    if (vite) {
      await vite.close();
    }
  });

  describe('GET /token', () => {
    it('should generate a token successfully', async () => {
      const mockCharacter = { title: 'Default Character', prompt: 'Default prompt', voice: 'echo' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ client_secret: { value: 'mock-secret' } }) });
      const response = await request(app).get('/token');
      expect(response.status).toBe(200);
      expect(response.body.client_secret.value).toBe('mock-secret');
    });
     it('should use query parameters for character, temperature, and voice', async () => {
      const mockCharacter = { title: 'Specific Character', prompt: 'Specific prompt', voice: 'nova' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ client_secret: {value: "s"} }) });
      const queryParams = { character: 'specific', temperature: 0.5, voice: 'alloy' };
      await request(app).get('/token').query(queryParams);
      expect(vi.mocked(getCharacterPromptByIdMock)).toHaveBeenCalledWith('specific');
      expect(mockFetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          body: expect.stringContaining('"voice":"alloy"')})
      );
    });
    it('should use character default voice if voice query param is not provided', async () => {
      const mockCharacter = { title: 'Specific Character', prompt: 'Specific prompt', voice: 'shimmer' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ client_secret: {value: "s"} }) });
      await request(app).get('/token').query({ character: 'charWithVoice' });
      expect(mockFetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          body: expect.stringContaining('"voice":"shimmer"')})
      );
    });
    it('should use fallback model if OPENAI_API_MODEL is not set', async () => {
      delete process.env.OPENAI_API_MODEL;
      const mockCharacter = { title: 'Default', prompt: 'Prompt', voice: 'echo' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ client_secret: {value: "s"} }) });
      const response = await request(app).get('/token');
      expect(response.body.apiModel).toBe('gpt-4o-realtime-preview-2024-12-17');
    });
    it('should return 404 if character not found', async () => {
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(null);
      const response = await request(app).get('/token?character=unknown');
      expect(response.status).toBe(404);
    });
    it('should handle OpenAI API non-ok response correctly', async () => {
      const mockCharacter = { title: 'Default', prompt: 'Prompt', voice: 'echo' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockResolvedValue({
        ok: false, status: 400, json: async () => ({ error: { message: 'OpenAI bad request' } }),
      });
      const response = await request(app).get('/token');
      expect(response.status).toBe(200); 
      expect(response.body.error.message).toBe('OpenAI bad request');
    });
    it('should return 500 if fetch itself throws an error', async () => {
      const mockCharacter = { title: 'Default', prompt: 'Prompt', voice: 'echo' };
      vi.mocked(getCharacterPromptByIdMock).mockReturnValue(mockCharacter);
      mockFetch.mockRejectedValue(new Error("Network Error"));
      const response = await request(app).get('/token');
      expect(response.status).toBe(500);
    });
  });

  describe('POST /save-audio', () => {
    const mockAudioData = Buffer.from('mock-audio-data').toString('base64');

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
      vi.mocked(fsExistsSyncMock).mockReturnValue(false);
    });
    
    it('should save audio successfully (webm and mp3) with exportType "last"', async () => {
      const responsePromise = request(app)
        .post('/save-audio')
        .send({ audioData: `data:audio/webm;base64,${mockAudioData}`, exportType: 'last' });
      
      await vi.runAllTimersAsync(); // Advance timers to allow mocked ffmpeg to "complete"
      const response = await responsePromise;

      expect(response.status).toBe(200);
      const expectedTimestamp = '2024-01-01T12-00-00';
      expect(response.body.mp3.filename).toBe(`last-response-${expectedTimestamp}.mp3`);
      expect(fsWriteFileSyncMock).toHaveBeenCalled();
      expect(ffmpegMainMock).toHaveBeenCalled(); 
      
      const ffmpegMockLastInstance = vi.mocked(ffmpegMainMock).mock.results.slice(-1)[0]?.value;
      expect(ffmpegMockLastInstance).toBeDefined();
      expect(ffmpegMockLastInstance.run).toHaveBeenCalled();
    });

    it('should return 400 if audioData is missing', async () => {
      const response = await request(app).post('/save-audio').send({});
      expect(response.status).toBe(400);
    });

    it('should return 500 if ffmpeg conversion fails', async () => {
      vi.mocked(fsExistsSyncMock).mockReturnValue(true);
      
      vi.mocked(ffmpegMainMock).mockImplementationOnce(() => {
        const errorInstance = createMockFfmpegCommandInstance();
        errorInstance._shouldError = true;
        return errorInstance;
      });
            
      const responsePromise = request(app)
        .post('/save-audio')
        .send({ audioData: mockAudioData, exportType: 'last' });

      await vi.runAllTimersAsync(); // Advance timers
      const response = await responsePromise;

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/Mock FFMpeg Error/);
      
      const ffmpegMockLastInstance = vi.mocked(ffmpegMainMock).mock.results.slice(-1)[0]?.value;
      expect(ffmpegMockLastInstance).toBeDefined();
      expect(ffmpegMockLastInstance._shouldError).toBe(true);
    });
  });
});
