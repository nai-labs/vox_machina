import { useRef, useState, useCallback, useEffect } from 'react';

const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 1; // Mono
const BUFFER_SIZE = 4096; // Common buffer size for ScriptProcessorNode

export function usePcmStreamer() {
  const audioContextRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);
  const scriptProcessorNodeRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const onChunkCallbackRef = useRef(null);

  const closeAudioResources = useCallback(() => {
    if (scriptProcessorNodeRef.current) {
      scriptProcessorNodeRef.current.disconnect();
      scriptProcessorNodeRef.current.onaudioprocess = null; // Remove handler
      scriptProcessorNodeRef.current = null;
      console.log('[PcmStreamer] ScriptProcessorNode disconnected and cleared.');
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
      console.log('[PcmStreamer] MediaStreamSource disconnected.');
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      console.log('[PcmStreamer] MediaStream tracks stopped.');
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().then(() => {
        console.log('[PcmStreamer] AudioContext closed.');
        audioContextRef.current = null;
      }).catch(e => console.error('[PcmStreamer] Error closing AudioContext:', e));
    } else if (audioContextRef.current && audioContextRef.current.state === 'closed') {
        audioContextRef.current = null; // Ensure it's nullified if already closed
    }
  }, []);

  // Basic resampling (linear interpolation)
  const resampleBuffer = (inputBuffer, inputSampleRate) => {
    if (inputSampleRate === TARGET_SAMPLE_RATE) {
      return inputBuffer;
    }
    const sampleRateRatio = inputSampleRate / TARGET_SAMPLE_RATE;
    const outputLength = Math.floor(inputBuffer.length / sampleRateRatio);
    const outputBuffer = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const theoreticalIndex = i * sampleRateRatio;
      const index1 = Math.floor(theoreticalIndex);
      const index2 = Math.min(index1 + 1, inputBuffer.length - 1);
      const fraction = theoreticalIndex - index1;
      outputBuffer[i] = inputBuffer[index1] + (inputBuffer[index2] - inputBuffer[index1]) * fraction;
    }
    return outputBuffer;
  };

  // Convert Float32Array to Int16Array
  const float32ToInt16 = (buffer) => {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      buf[i] = Math.min(1, buffer[i]) * 0x7FFF; // Clamp and scale
    }
    return buf;
  };

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const startStreaming = useCallback(async (onChunk) => {
    if (isStreaming) {
      console.warn('[PcmStreamer] Streaming already in progress.');
      return;
    }
    setError(null);
    onChunkCallbackRef.current = onChunk;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[PcmStreamer] AudioContext created/recreated. State:', audioContextRef.current.state);
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('[PcmStreamer] AudioContext resumed.');
      }

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[PcmStreamer] Microphone access granted.');

      mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      
      // Using ScriptProcessorNode for broader compatibility, though AudioWorklet is preferred for performance.
      // Buffer size, input channels, output channels
      scriptProcessorNodeRef.current = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, TARGET_CHANNELS, TARGET_CHANNELS);

      scriptProcessorNodeRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isStreaming && !onChunkCallbackRef.current) return; // Check if we should still process

        const inputBuffer = audioProcessingEvent.inputBuffer.getChannelData(0); // Assuming mono input from mic
        
        // Resample
        const resampledBuffer = resampleBuffer(inputBuffer, audioContextRef.current.sampleRate);
        
        // Convert to 16-bit PCM
        const pcm16Buffer = float32ToInt16(resampledBuffer);
        
        // Convert to Base64
        const base64Pcm = arrayBufferToBase64(pcm16Buffer.buffer);
        
        if (onChunkCallbackRef.current) {
          onChunkCallbackRef.current(base64Pcm);
        }
      };

      mediaStreamSourceRef.current.connect(scriptProcessorNodeRef.current);
      scriptProcessorNodeRef.current.connect(audioContextRef.current.destination); // Necessary for ScriptProcessorNode to run

      setIsStreaming(true);
      console.log('[PcmStreamer] Streaming started.');

    } catch (err) {
      console.error('[PcmStreamer] Error starting streaming:', err);
      setError(err.message || 'Failed to start audio streaming.');
      closeAudioResources(); // Clean up on error
      setIsStreaming(false);
    }
  }, [isStreaming, closeAudioResources]); // Added closeAudioResources

  const stopStreaming = useCallback(() => {
    if (!isStreaming) {
      // console.warn('[PcmStreamer] Streaming not in progress or already stopped.');
      return;
    }
    console.log('[PcmStreamer] Stopping streaming...');
    setIsStreaming(false);
    onChunkCallbackRef.current = null; // Clear callback
    closeAudioResources();
  }, [isStreaming, closeAudioResources]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming(); // Ensure everything is stopped and cleaned up
    };
  }, [stopStreaming]);

  return { startStreaming, stopStreaming, isStreaming, error };
}
