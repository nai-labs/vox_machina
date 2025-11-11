import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Audio file validation utilities for VOX MACHINA
 * Provides health checks and playability validation for exported audio files
 */

/**
 * Validate an audio file's basic properties
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<Object>} Validation result with details
 */
export async function validateAudioFile(filePath) {
  const result = {
    isValid: false,
    exists: false,
    size: 0,
    duration: null,
    format: null,
    error: null,
    details: {}
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      result.error = 'File does not exist';
      return result;
    }
    
    result.exists = true;
    
    // Get file size
    const stats = fs.statSync(filePath);
    result.size = stats.size;
    
    // Check minimum size (empty files are invalid)
    if (result.size < 100) {
      result.error = 'File is too small (likely empty or corrupted)';
      return result;
    }
    
    // Probe the file with ffmpeg to get detailed info
    const probeResult = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
    
    // Extract audio stream info
    const audioStream = probeResult.streams.find(stream => stream.codec_type === 'audio');
    
    if (!audioStream) {
      result.error = 'No audio stream found in file';
      return result;
    }
    
    result.duration = parseFloat(audioStream.duration) || parseFloat(probeResult.format.duration);
    result.format = {
      container: probeResult.format.format_name,
      codec: audioStream.codec_name,
      sampleRate: audioStream.sample_rate,
      channels: audioStream.channels,
      bitrate: audioStream.bit_rate || probeResult.format.bit_rate
    };
    
    // Validate duration
    if (!result.duration || result.duration <= 0) {
      result.error = 'Invalid or zero duration';
      return result;
    }
    
    // Check for reasonable duration limits
    if (result.duration > 7200) { // 2 hours
      result.details.warning = 'File duration is very long (>2 hours)';
    }
    
    // Additional format-specific validations
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.webm':
        if (!['vorbis', 'opus'].includes(result.format.codec)) {
          result.details.warning = `Unexpected codec for WebM: ${result.format.codec}`;
        }
        break;
      case '.mp3':
        if (result.format.codec !== 'mp3') {
          result.details.warning = `Unexpected codec for MP3: ${result.format.codec}`;
        }
        break;
      case '.wav':
        if (!result.format.codec.includes('pcm')) {
          result.details.warning = `Unexpected codec for WAV: ${result.format.codec}`;
        }
        break;
    }
    
    result.isValid = true;
    
  } catch (error) {
    result.error = `Validation failed: ${error.message}`;
  }
  
  return result;
}

/**
 * Quick playability test - checks if a file can be opened and has basic audio properties
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<boolean>} True if file appears playable
 */
export async function isAudioPlayable(filePath) {
  try {
    const validation = await validateAudioFile(filePath);
    return validation.isValid && validation.duration > 0;
  } catch (error) {
    console.error('Playability check failed:', error);
    return false;
  }
}

/**
 * Comprehensive health check for an exported audio session
 * @param {Object} exportResult - Result object from /save-audio endpoint
 * @returns {Promise<Object>} Health check results
 */
export async function performAudioHealthCheck(exportResult) {
  const healthCheck = {
    overall: 'unknown',
    files: {},
    recommendations: [],
    errors: []
  };
  
  if (!exportResult || !exportResult.source) {
    healthCheck.overall = 'failed';
    healthCheck.errors.push('No export result provided');
    return healthCheck;
  }
  
  // Check source file
  if (exportResult.source && exportResult.source.path) {
    healthCheck.files.source = await validateAudioFile(exportResult.source.path);
    
    if (!healthCheck.files.source.isValid) {
      healthCheck.errors.push(`Source file invalid: ${healthCheck.files.source.error}`);
    }
  }
  
  // Check MP3 file if it exists
  if (exportResult.mp3 && exportResult.mp3.path) {
    healthCheck.files.mp3 = await validateAudioFile(exportResult.mp3.path);
    
    if (!healthCheck.files.mp3.isValid) {
      healthCheck.errors.push(`MP3 file invalid: ${healthCheck.files.mp3.error}`);
    }
  }
  
  // Check WAV file if it exists
  if (exportResult.wav && exportResult.wav.path) {
    healthCheck.files.wav = await validateAudioFile(exportResult.wav.path);
    
    if (!healthCheck.files.wav.isValid) {
      healthCheck.errors.push(`WAV file invalid: ${healthCheck.files.wav.error}`);
    }
  }
  
  // Determine overall health
  const validFiles = Object.values(healthCheck.files).filter(f => f.isValid).length;
  const totalFiles = Object.keys(healthCheck.files).length;
  
  if (validFiles === 0) {
    healthCheck.overall = 'failed';
    healthCheck.errors.push('No valid audio files found');
  } else if (validFiles === totalFiles) {
    healthCheck.overall = 'excellent';
  } else if (validFiles >= 1) {
    healthCheck.overall = 'partial';
    healthCheck.recommendations.push('Some audio formats failed conversion but source file is valid');
  }
  
  // Add recommendations based on findings
  if (healthCheck.files.source && healthCheck.files.source.isValid && 
      (!healthCheck.files.mp3 || !healthCheck.files.mp3.isValid)) {
    healthCheck.recommendations.push('Consider using the source file directly or retry MP3 conversion');
  }
  
  if (healthCheck.files.wav && healthCheck.files.wav.isValid && 
      (!healthCheck.files.mp3 || !healthCheck.files.mp3.isValid)) {
    healthCheck.recommendations.push('WAV file is available as alternative to MP3');
  }
  
  return healthCheck;
}

/**
 * Get a human-readable summary of audio file validation
 * @param {Object} validation - Result from validateAudioFile
 * @returns {string} Human-readable summary
 */
export function getValidationSummary(validation) {
  if (!validation.isValid) {
    return `❌ Invalid: ${validation.error}`;
  }
  
  const duration = validation.duration ? `${Math.round(validation.duration)}s` : 'unknown duration';
  const size = validation.size ? `${(validation.size / 1024 / 1024).toFixed(1)}MB` : 'unknown size';
  const format = validation.format ? 
    `${validation.format.container}/${validation.format.codec}` : 'unknown format';
  
  let summary = `✅ Valid: ${duration}, ${size}, ${format}`;
  
  if (validation.details && validation.details.warning) {
    summary += ` ⚠️ ${validation.details.warning}`;
  }
  
  return summary;
}