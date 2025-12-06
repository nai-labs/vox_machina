/**
 * Audio route handler for saving and converting audio exports
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { performAudioHealthCheck } from '../audioValidator.js';

const router = express.Router();

/**
 * POST /save-audio
 * Save audio data to disk and convert to MP3/WAV formats
 * 
 * Request body:
 * - audioData: Base64-encoded audio data
 * - isRecentMessage: Boolean indicating if this is a recent message only
 * - exportType: 'last' | 'full' | undefined
 * - character: Character object with name property
 * - sourceFormat: 'webm' | 'wav' (default: 'webm')
 */
router.post('/', async (req, res) => {
    try {
        console.log('[Audio] Received save-audio request');
        const { audioData, isRecentMessage, exportType, character, sourceFormat = 'webm' } = req.body;

        // Create outputs directory if it doesn't exist
        const outputsDir = path.join(process.cwd(), 'outputs');
        if (!fs.existsSync(outputsDir)) {
            fs.mkdirSync(outputsDir, { recursive: true });
            console.log('[Audio] Created outputs directory:', outputsDir);
        }

        // Create timestamp for filenames (more readable format)
        const now = new Date();
        const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        const timestamp = `${date}_${time}`;

        // Handle the audio export
        if (!audioData) {
            console.log('[Audio] No audio data provided in request');
            return res.status(400).json({ error: 'No audio data provided' });
        }

        console.log('[Audio] Audio data received, size:', audioData.length);
        console.log('[Audio] Export type:', exportType || 'standard');
        console.log('[Audio] Source format:', sourceFormat);
        console.log('[Audio] Character:', character ? character.name : 'unknown');
        console.log('[Audio] Is recent message only:', isRecentMessage ? 'yes' : 'no');

        // Validate base64 data format
        let base64Data = audioData;
        if (base64Data.indexOf('base64,') > -1) {
            base64Data = base64Data.split('base64,')[1];
        }

        // Validate base64 format
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
            console.error('[Audio] Invalid base64 data format');
            return res.status(400).json({ error: 'Invalid audio data format' });
        }

        // Convert base64 data to buffer with error handling
        let buffer;
        try {
            buffer = Buffer.from(base64Data, 'base64');
            console.log('[Audio] Buffer created, size:', buffer.length);

            // Validate minimum size (empty files are problematic)
            if (buffer.length < 100) {
                console.error('[Audio] Audio buffer too small:', buffer.length);
                return res.status(400).json({ error: 'Audio data appears to be empty or corrupted' });
            }

            // Check for very large files
            if (buffer.length > 100 * 1024 * 1024) { // 100MB limit
                console.warn('[Audio] Very large audio file detected:', (buffer.length / 1024 / 1024).toFixed(1), 'MB');
            }
        } catch (decodeError) {
            console.error('[Audio] Failed to decode base64 audio data:', decodeError);
            return res.status(400).json({ error: 'Failed to decode audio data' });
        }

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

        // Determine source file extension based on format
        const sourceExtension = sourceFormat === 'wav' ? 'wav' : 'webm';
        const sourceFilename = `vox-machina_${characterName}_${exportTypeLabel}_${timestamp}.${sourceExtension}`;
        const sourceFilePath = path.join(outputsDir, sourceFilename);

        // Write source file to disk with error handling
        try {
            fs.writeFileSync(sourceFilePath, buffer);
            console.log(`[Audio] ${sourceExtension.toUpperCase()} file saved to:`, sourceFilePath);

            // Verify the file was written correctly
            const writtenSize = fs.statSync(sourceFilePath).size;
            if (writtenSize !== buffer.length) {
                throw new Error(`File size mismatch: expected ${buffer.length}, got ${writtenSize}`);
            }
        } catch (writeError) {
            console.error('[Audio] Failed to write source file:', writeError);
            return res.status(500).json({ error: `Failed to save source file: ${writeError.message}` });
        }

        // Create mp3 filename
        const mp3Filename = `vox-machina_${characterName}_${exportTypeLabel}_${timestamp}.mp3`;
        const mp3FilePath = path.join(outputsDir, mp3Filename);

        // Create WAV fallback for WebM files if needed
        let wavFilePath = null;
        let wavFilename = null;

        if (sourceFormat === 'webm') {
            wavFilename = `vox-machina_${characterName}_${exportTypeLabel}_${timestamp}.wav`;
            wavFilePath = path.join(outputsDir, wavFilename);

            try {
                await new Promise((resolve, reject) => {
                    ffmpeg(sourceFilePath)
                        .output(wavFilePath)
                        .audioCodec('pcm_s16le')
                        .audioFrequency(44100)
                        .audioChannels(1)
                        .on('end', () => {
                            console.log('[Audio] WAV conversion finished:', wavFilePath);
                            resolve();
                        })
                        .on('error', (err) => {
                            console.warn('[Audio] WAV conversion failed:', err.message);
                            resolve(); // Don't fail the whole operation
                        })
                        .run();
                });
            } catch (wavError) {
                console.warn('[Audio] WAV conversion error:', wavError);
                // Continue without WAV file
            }
        }

        // Convert to mp3 using ffmpeg with silence removal
        try {
            await new Promise((resolve, reject) => {
                const ffmpegCommand = ffmpeg(sourceFilePath)
                    .output(mp3FilePath)
                    .audioFilters('silenceremove=stop_periods=-1:stop_threshold=-50dB:stop_duration=1:start_threshold=-50dB:start_duration=0.1')
                    .audioCodec('libmp3lame')
                    .audioBitrate('128k')
                    .on('end', () => {
                        console.log('[Audio] MP3 conversion finished with silence removal:', mp3FilePath);

                        // Verify MP3 was created successfully
                        if (fs.existsSync(mp3FilePath)) {
                            const mp3Size = fs.statSync(mp3FilePath).size;
                            if (mp3Size > 0) {
                                console.log('[Audio] MP3 file verified, size:', mp3Size);
                                resolve();
                            } else {
                                reject(new Error('MP3 file is empty'));
                            }
                        } else {
                            reject(new Error('MP3 file was not created'));
                        }
                    })
                    .on('error', (err) => {
                        console.error('[Audio] MP3 conversion error:', err);
                        reject(err);
                    })
                    .on('progress', (progress) => {
                        if (progress.percent) {
                            console.log(`[Audio] MP3 conversion progress: ${Math.round(progress.percent)}%`);
                        }
                    });

                // Handle different input formats
                if (sourceFormat === 'wav') {
                    ffmpegCommand.inputFormat('wav');
                }

                ffmpegCommand.run();
            });

            const response = {
                success: true,
                message: 'Audio saved successfully',
                source: {
                    filename: sourceFilename,
                    path: sourceFilePath,
                    format: sourceExtension
                },
                mp3: {
                    filename: mp3Filename,
                    path: mp3FilePath
                }
            };

            // Include WAV file if it was created
            if (wavFilePath && fs.existsSync(wavFilePath)) {
                response.wav = {
                    filename: wavFilename,
                    path: wavFilePath
                };
            }

            // Perform health check on exported files
            try {
                const healthCheck = await performAudioHealthCheck(response);
                response.healthCheck = healthCheck;

                // Log health check results
                console.log('[Audio] Export health check:', healthCheck.overall);
                if (healthCheck.errors.length > 0) {
                    console.warn('[Audio] Health check errors:', healthCheck.errors);
                }
                if (healthCheck.recommendations.length > 0) {
                    console.log('[Audio] Health check recommendations:', healthCheck.recommendations);
                }
            } catch (healthError) {
                console.warn('[Audio] Health check failed:', healthError);
                response.healthCheckError = healthError.message;
            }

            res.json(response);
        } catch (conversionError) {
            console.error('[Audio] MP3 conversion failed:', conversionError);

            // If conversion fails, still return success for the source file
            const response = {
                success: true,
                message: 'Audio saved successfully (MP3 conversion failed)',
                source: {
                    filename: sourceFilename,
                    path: sourceFilePath,
                    format: sourceExtension
                },
                mp3: null,
                warning: `MP3 conversion failed: ${conversionError.message}`
            };

            // Include WAV file if it was created
            if (wavFilePath && fs.existsSync(wavFilePath)) {
                response.wav = {
                    filename: wavFilename,
                    path: wavFilePath
                };
                response.message = 'Audio saved successfully (MP3 conversion failed, but WAV available)';
            }

            // Perform health check on exported files
            try {
                const healthCheck = await performAudioHealthCheck(response);
                response.healthCheck = healthCheck;

                // Log health check results
                console.log('[Audio] Export health check:', healthCheck.overall);
                if (healthCheck.errors.length > 0) {
                    console.warn('[Audio] Health check errors:', healthCheck.errors);
                }
                if (healthCheck.recommendations.length > 0) {
                    console.log('[Audio] Health check recommendations:', healthCheck.recommendations);
                }
            } catch (healthError) {
                console.warn('[Audio] Health check failed:', healthError);
                response.healthCheckError = healthError.message;
            }

            res.json(response);
        }
    } catch (error) {
        console.error('[Audio] Error saving audio:', error);
        res.status(500).json({ error: `Failed to save audio file: ${error.message}` });
    }
});

export default router;
