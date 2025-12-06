import { useRef, useState, useCallback } from 'react';
import { float32ToWavBlob, concatenateFloat32Arrays } from '../utils/audioUtils';

export function useUnifiedAudioCapture() {
  const [fullConversationAudio, setFullConversationAudio] = useState(null);
  const [lastResponseAudio, setLastResponseAudio] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // For OpenAI WebRTC streams
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // For Gemini PCM data
  const fullConversationPcmRef = useRef([]);
  const lastResponsePcmRef = useRef(null);
  const isAccumulatingResponseRef = useRef(false);

  // Common audio processing
  const sampleRate = 24000; // Standard rate for Gemini, OpenAI adapts

  // Wrapper for shared utility for backward compatibility with existing code
  const pcmToWavBlob = useCallback((float32PcmArray, sampleRateVal = sampleRate, numChannels = 1) => {
    return float32ToWavBlob(float32PcmArray, sampleRateVal, numChannels);
  }, []);

  // OpenAI WebRTC stream setup
  const setupWebRTCCapture = useCallback((stream) => {
    try {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Update full conversation audio in real-time
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setFullConversationAudio(audioBlob);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setFullConversationAudio(audioBlob);
          console.log('[UnifiedAudioCapture] WebRTC recording stopped, saved blob:', audioBlob.size);
        }
      };

      mediaRecorder.start(1000); // Capture every second
      setIsCapturing(true);
      console.log('[UnifiedAudioCapture] WebRTC capture started');

    } catch (err) {
      console.error('[UnifiedAudioCapture] Failed to set up WebRTC capture:', err);
    }
  }, []);

  // Gemini PCM accumulation
  const addPcmChunk = useCallback((float32Array) => {
    if (!float32Array || float32Array.length === 0) return;

    // Add to full conversation
    fullConversationPcmRef.current.push(float32Array.slice());

    // Add to current response if we're accumulating
    if (isAccumulatingResponseRef.current) {
      if (!lastResponsePcmRef.current) {
        lastResponsePcmRef.current = [];
      }
      lastResponsePcmRef.current.push(float32Array.slice());
    }

    console.log('[UnifiedAudioCapture] PCM chunk added. Full conversation chunks:', fullConversationPcmRef.current.length);
  }, []);

  // Start accumulating a new response
  const startResponseCapture = useCallback(() => {
    lastResponsePcmRef.current = [];
    isAccumulatingResponseRef.current = true;
    console.log('[UnifiedAudioCapture] Started response capture');
  }, []);

  // Finalize the current response
  const finalizePcmResponse = useCallback(() => {
    if (isAccumulatingResponseRef.current && lastResponsePcmRef.current && lastResponsePcmRef.current.length > 0) {
      // Concatenate all chunks into a single Float32Array
      const totalLength = lastResponsePcmRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const concatenated = new Float32Array(totalLength);
      let offset = 0;

      for (const chunk of lastResponsePcmRef.current) {
        concatenated.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to WAV blob and store
      const wavBlob = pcmToWavBlob(concatenated);
      setLastResponseAudio(wavBlob);

      console.log('[UnifiedAudioCapture] Response finalized. Samples:', totalLength, 'Blob size:', wavBlob.size);
    }

    isAccumulatingResponseRef.current = false;
  }, [pcmToWavBlob]);

  // Get full conversation as WAV for Gemini
  const getFullConversationPcmAsWav = useCallback(() => {
    if (fullConversationPcmRef.current.length === 0) {
      return null;
    }

    // Concatenate all PCM chunks
    const totalLength = fullConversationPcmRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const concatenated = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of fullConversationPcmRef.current) {
      concatenated.set(chunk, offset);
      offset += chunk.length;
    }

    return pcmToWavBlob(concatenated);
  }, [pcmToWavBlob]);

  // Stop capturing
  const stopCapture = useCallback(() => {
    // Stop WebRTC recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Finalize any ongoing PCM response
    if (isAccumulatingResponseRef.current) {
      finalizePcmResponse();
    }

    setIsCapturing(false);
    console.log('[UnifiedAudioCapture] Capture stopped');
  }, [finalizePcmResponse]);

  // Clear all audio data
  const clearAudioData = useCallback(() => {
    audioChunksRef.current = [];
    fullConversationPcmRef.current = [];
    lastResponsePcmRef.current = null;
    isAccumulatingResponseRef.current = false;

    setFullConversationAudio(null);
    setLastResponseAudio(null);
    setIsCapturing(false);

    console.log('[UnifiedAudioCapture] All audio data cleared');
  }, []);

  return {
    // State
    fullConversationAudio,
    lastResponseAudio,
    isCapturing,

    // OpenAI WebRTC methods
    setupWebRTCCapture,

    // Gemini PCM methods
    addPcmChunk,
    startResponseCapture,
    finalizePcmResponse,
    getFullConversationPcmAsWav,

    // Common methods
    stopCapture,
    clearAudioData,

    // Utility
    pcmToWavBlob
  };
}