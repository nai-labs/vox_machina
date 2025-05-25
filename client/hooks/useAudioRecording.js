import { useRef, useState, useCallback } from 'react';

export function useAudioRecording() {
  const [lastAudioResponse, setLastAudioResponse] = useState(null);
  const [lastMessageAudio, setLastMessageAudio] = useState(null);
  const [isRecordingCurrentResponse, setIsRecordingCurrentResponse] = useState(false);
  
  // MediaRecorder for full conversation
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  // Web Audio API for real-time response capture
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const currentResponseBufferRef = useRef([]);
  const isCapturingResponseRef = useRef(false);
  const sampleRate = 44100;
  
  const audioResponsesHistoryRef = useRef([]);
  const recordingStartTimeRef = useRef(null);
  
  // Audio-level based stopping
  const lastAudioActivityTimeRef = useRef(null);
  const isWaitingForSilenceRef = useRef(false);
  const silenceThreshold = 0.01; // RMS amplitude threshold for silence detection
  const silenceTimeoutMs = 1500; // Wait 1.5 seconds of silence before stopping

  // Helper function to convert AudioBuffer to WAV blob
  const audioBufferToWav = useCallback((audioBuffer) => {
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }, []);

  const processResponseAudio = useCallback(() => {
    console.log(`[DEBUG] Processing response audio. Buffer chunks: ${currentResponseBufferRef.current.length}`);
    
    if (currentResponseBufferRef.current.length === 0) {
      console.log("[DEBUG] No audio data captured for response");
      return;
    }
    
    try {
      // Calculate total length
      const totalLength = currentResponseBufferRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[DEBUG] Total audio samples: ${totalLength}`);
      
      if (totalLength === 0) {
        console.log("[DEBUG] No audio samples to process");
        return;
      }
      
      // Combine all chunks into a single buffer
      const combinedBuffer = new Float32Array(totalLength);
      let offset = 0;
      
      for (const chunk of currentResponseBufferRef.current) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Create an audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(1, totalLength, sampleRate);
      audioBuffer.copyToChannel(combinedBuffer, 0);
      
      // Convert to WAV blob
      const wavBlob = audioBufferToWav(audioBuffer);
      console.log(`[DEBUG] Created WAV blob for last response: ${wavBlob.size} bytes`);
      
      setLastMessageAudio(wavBlob);
      audioResponsesHistoryRef.current.push(wavBlob);
      
      console.log("Added response to history, total responses:", audioResponsesHistoryRef.current.length);
      
    } catch (err) {
      console.error("Error processing response audio:", err);
    }
  }, [audioBufferToWav]);

  const actuallyStopRecording = useCallback(() => {
    console.log("[DEBUG] Actually stopping response recording after silence detection");
    
    isCapturingResponseRef.current = false;
    setIsRecordingCurrentResponse(false);
    isWaitingForSilenceRef.current = false;
    
    // Process the captured audio
    processResponseAudio();
  }, [processResponseAudio]);

  const setupWebAudioCapture = useCallback((stream) => {
    try {
      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: sampleRate
      });
      
      // Create source from stream
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create script processor for real-time audio capture
      const bufferSize = 4096;
      processorNodeRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      
      processorNodeRef.current.onaudioprocess = (event) => {
        if (isCapturingResponseRef.current) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Calculate RMS amplitude for silence detection
          let rms = 0;
          for (let i = 0; i < inputData.length; i++) {
            rms += inputData[i] * inputData[i];
          }
          rms = Math.sqrt(rms / inputData.length);
          
          // Check if this is significant audio activity
          if (rms > silenceThreshold) {
            lastAudioActivityTimeRef.current = Date.now();
            console.log(`[DEBUG] Audio activity detected, RMS: ${rms.toFixed(4)}`);
          }
          
          // Copy the audio data
          const audioData = new Float32Array(inputData.length);
          audioData.set(inputData);
          currentResponseBufferRef.current.push(audioData);
          
          console.log(`[DEBUG] Captured audio chunk: ${audioData.length} samples, RMS: ${rms.toFixed(4)}`);
          
          // Check if we should stop recording due to silence
          if (isWaitingForSilenceRef.current && lastAudioActivityTimeRef.current) {
            const timeSinceLastActivity = Date.now() - lastAudioActivityTimeRef.current;
            if (timeSinceLastActivity >= silenceTimeoutMs) {
              console.log(`[DEBUG] Silence detected for ${timeSinceLastActivity}ms, stopping recording`);
              actuallyStopRecording();
            }
          }
        }
      };
      
      // Connect the nodes
      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(audioContextRef.current.destination);
      
      console.log("Web Audio API setup complete for real-time capture");
      
    } catch (err) {
      console.error("Failed to set up Web Audio API:", err);
    }
  }, [actuallyStopRecording]);

  const setupMediaRecorder = useCallback((stream) => {
    try {
      // Set up traditional MediaRecorder for full conversation
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      audioChunksRef.current = [];
      audioResponsesHistoryRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setLastAudioResponse(audioBlob);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setLastAudioResponse(audioBlob);
          console.log("Media recorder stopped, saved blob", audioBlob.size);
        }
      };
      
      // Start recording for full conversation
      mediaRecorder.start(1000);
      console.log("MediaRecorder started for full conversation");
      
      // Set up Web Audio API for real-time response capture
      setupWebAudioCapture(stream);
      
    } catch (err) {
      console.error("Failed to set up media recorder:", err);
    }
  }, [setupWebAudioCapture]);

  const startRecordingResponse = useCallback(() => {
    console.log("[DEBUG] Starting response recording");
    
    // Reset the response buffer
    currentResponseBufferRef.current = [];
    isCapturingResponseRef.current = true;
    setIsRecordingCurrentResponse(true);
    
    console.log("[DEBUG] Response recording started - capturing audio data");
  }, []);

  const stopRecordingResponse = useCallback(() => {
    console.log("[DEBUG] Response done - waiting for silence to stop recording");
    
    // Instead of immediately stopping, start waiting for silence
    isWaitingForSilenceRef.current = true;
    
    // Reset the last activity time to start the silence countdown
    lastAudioActivityTimeRef.current = Date.now();
    
    console.log("[DEBUG] Now monitoring for silence...");
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Clean up Web Audio API
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  }, []);

  const clearAudioHistory = useCallback(() => {
    audioResponsesHistoryRef.current = [];
    currentResponseBufferRef.current = [];
    setLastMessageAudio(null);
    isCapturingResponseRef.current = false;
  }, []);

  return {
    lastAudioResponse,
    lastMessageAudio,
    isRecordingCurrentResponse,
    setupMediaRecorder,
    startRecordingResponse,
    stopRecordingResponse,
    stopRecording,
    clearAudioHistory
  };
}
