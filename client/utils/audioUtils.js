/**
 * Shared audio utility functions for VOX MACHINA
 * Consolidates duplicated audio processing logic from hooks
 */

/**
 * Decode base64-encoded PCM data to a Uint8Array
 * @param {string} base64Data - Base64 encoded PCM audio data
 * @returns {Uint8Array} Decoded byte array
 */
export function base64ToPcm(base64Data) {
    const byteString = atob(base64Data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
    }
    return byteArray;
}

/**
 * Convert 16-bit PCM (Int16Array) to Float32Array normalized to [-1, 1]
 * @param {Int16Array} pcm16 - 16-bit PCM samples
 * @returns {Float32Array} Normalized float samples
 */
export function pcm16ToFloat32(pcm16) {
    const float32Array = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32Array[i] = pcm16[i] / 32768.0;
    }
    return float32Array;
}

/**
 * Convert Float32Array to 16-bit PCM (Int16Array)
 * @param {Float32Array} float32Array - Normalized float samples [-1, 1]
 * @returns {Int16Array} 16-bit PCM samples
 */
export function float32ToPcm16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
}

/**
 * Write a WAV file header to a DataView
 * @param {DataView} view - DataView to write header to
 * @param {number} dataLength - Length of PCM data in samples
 * @param {number} sampleRate - Audio sample rate (e.g., 24000, 44100)
 * @param {number} numChannels - Number of audio channels (1 = mono, 2 = stereo)
 */
export function writeWavHeader(view, dataLength, sampleRate, numChannels = 1) {
    const bytesPerSample = 2; // 16-bit audio
    const byteRate = sampleRate * numChannels * bytesPerSample;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = dataLength * bytesPerSample;

    // Helper to write ASCII string
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);           // File size - 8
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);                     // Subchunk1Size (PCM = 16)
    view.setUint16(20, 1, true);                      // AudioFormat (PCM = 1)
    view.setUint16(22, numChannels, true);            // NumChannels
    view.setUint32(24, sampleRate, true);             // SampleRate
    view.setUint32(28, byteRate, true);               // ByteRate
    view.setUint16(32, blockAlign, true);             // BlockAlign
    view.setUint16(34, 16, true);                     // BitsPerSample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);               // Subchunk2Size
}

/**
 * Convert Float32Array PCM data to a WAV Blob
 * @param {Float32Array} float32Array - Audio samples normalized to [-1, 1]
 * @param {number} sampleRate - Sample rate (default: 24000)
 * @param {number} numChannels - Number of channels (default: 1)
 * @returns {Blob} WAV audio blob
 */
export function float32ToWavBlob(float32Array, sampleRate = 24000, numChannels = 1) {
    const pcm16 = float32ToPcm16(float32Array);
    const buffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(buffer);

    writeWavHeader(view, pcm16.length, sampleRate, numChannels);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
        view.setInt16(offset, pcm16[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * Convert an AudioBuffer to a WAV Blob
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @returns {Blob} WAV audio blob
 */
export function audioBufferToWavBlob(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    return float32ToWavBlob(channelData, audioBuffer.sampleRate, 1);
}

/**
 * Decode base64 PCM and convert to Float32Array
 * Combines base64ToPcm and pcm16ToFloat32 for convenience
 * @param {string} base64Data - Base64 encoded 16-bit PCM data
 * @returns {Float32Array} Normalized float samples
 */
export function decodeBase64PcmToFloat32(base64Data) {
    const byteArray = base64ToPcm(base64Data);
    const pcm16 = new Int16Array(byteArray.buffer);
    return pcm16ToFloat32(pcm16);
}

/**
 * Concatenate multiple Float32Arrays into one
 * @param {Float32Array[]} chunks - Array of Float32Array chunks
 * @returns {Float32Array} Concatenated array
 */
export function concatenateFloat32Arrays(chunks) {
    if (!chunks || chunks.length === 0) {
        return new Float32Array(0);
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}
