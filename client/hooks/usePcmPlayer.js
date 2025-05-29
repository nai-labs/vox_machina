import { useRef, useState, useCallback, useEffect } from 'react';

export function usePcmPlayer() {
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const nextPlayTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isContextStarted, setIsContextStarted] = useState(false);
  const analyserNodeRef = useRef(null); // For visualization

  // For "Save Last" functionality
  const currentResponseChunksRef = useRef([]); // Stores Float32Array chunks for the current response
  const lastCompleteResponseDataRef = useRef(null); // Stores the concatenated Float32Array of the last response

  const sampleRate = 24000; 

  // Function to initialize/resume AudioContext on user gesture
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: sampleRate,
      });
      console.log('[PcmPlayer] AudioContext created. Initial state:', audioContextRef.current.state, 'Sample rate:', audioContextRef.current.sampleRate);
      // Create AnalyserNode when AudioContext is first created
      if (audioContextRef.current && !analyserNodeRef.current) {
        analyserNodeRef.current = audioContextRef.current.createAnalyser();
        analyserNodeRef.current.fftSize = 2048; // Default, can be configured
        console.log('[PcmPlayer] AnalyserNode created.');
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      console.log('[PcmPlayer] AudioContext is suspended, attempting to resume...');
      audioContextRef.current.resume().then(() => {
        console.log('[PcmPlayer] AudioContext resumed successfully.');
        setIsContextStarted(true);
        if (audioQueueRef.current.length > 0 && !isPlaying) {
            console.log('[PcmPlayer] AudioContext resumed, calling playNextInQueue for queued items.');
            playNextInQueue();
        }
      }).catch(err => console.error('[PcmPlayer] Error resuming AudioContext:', err));
    } else if (audioContextRef.current.state === 'running') {
        console.log('[PcmPlayer] AudioContext is already running.');
        setIsContextStarted(true);
    }
  }, [isPlaying]); // Added isPlaying to dependencies

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      console.log('[PcmPlayer] playNextInQueue: Queue is empty.');
      setIsPlaying(false);
      return;
    }
    if (!audioContextRef.current) {
      console.error('[PcmPlayer] playNextInQueue: AudioContext is null.');
      setIsPlaying(false);
      return;
    }
    if (audioContextRef.current.state !== 'running') {
      console.warn('[PcmPlayer] playNextInQueue: AudioContext not running. State:', audioContextRef.current.state);
      setIsPlaying(false); // Should not try to play if context is not running
      return;
    }

    setIsPlaying(true); // Set isPlaying true only when we are about to play.
    const audioBuffer = audioQueueRef.current.shift();
    console.log(`[PcmPlayer] playNextInQueue: Dequeued buffer. Duration: ${audioBuffer.duration.toFixed(3)}s. Queue size: ${audioQueueRef.current.length}`);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;

    if (analyserNodeRef.current) {
      source.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(audioContextRef.current.destination);
      // console.log('[PcmPlayer] Source connected through AnalyserNode to destination.');
    } else {
      source.connect(audioContextRef.current.destination); // Fallback
      console.warn('[PcmPlayer] AnalyserNode not available, connecting source directly to destination.');
    }

    const currentTime = audioContextRef.current.currentTime;
    // If nextPlayTime is in the past, play immediately. Otherwise, schedule it.
    const playTime = Math.max(currentTime, nextPlayTimeRef.current);
    
    source.start(playTime);
    console.log(`[PcmPlayer] Scheduled audio buffer to play at: ${playTime.toFixed(3)}s (AudioContext currentTime: ${currentTime.toFixed(3)}s). Next playTime will be: ${(playTime + audioBuffer.duration).toFixed(3)}s`);
    
    nextPlayTimeRef.current = playTime + audioBuffer.duration;

    source.onended = () => {
      console.log(`[PcmPlayer] Buffer finished playing. Current playTime: ${audioContextRef.current?.currentTime.toFixed(3)}s. Next scheduled: ${nextPlayTimeRef.current.toFixed(3)}s`);
      // isPlaying should be managed carefully. If onended is called, this source is done.
      // The next call to playNextInQueue will set it true if it plays something.
      // If queue is empty after this, isPlaying will be set to false by the start of playNextInQueue.
      playNextInQueue(); 
    };
  }, []); // Removed isPlaying from dependencies, it causes re-creation of this function


  const addAudioChunk = useCallback((base64PcmData) => {
    console.log('[PcmPlayer] addAudioChunk called. Data length (base64):', base64PcmData ? base64PcmData.length : 'null');
    ensureAudioContext(); 

    if (!base64PcmData) {
      console.warn('[PcmPlayer] addAudioChunk: No data provided.');
      return;
    }

    try {
      console.log('[PcmPlayer] addAudioChunk: Decoding base64...');
      const byteString = atob(base64PcmData);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      const pcmArrayBuffer = byteArray.buffer;
      console.log('[PcmPlayer] addAudioChunk: Decoded to ArrayBuffer, length:', pcmArrayBuffer.byteLength);

      const pcm16BitView = new Int16Array(pcmArrayBuffer);
      const float32Array = new Float32Array(pcm16BitView.length);
      for (let i = 0; i < pcm16BitView.length; i++) {
        float32Array[i] = pcm16BitView[i] / 32768.0;
      }
      console.log('[PcmPlayer] addAudioChunk: Converted to Float32Array, length:', float32Array.length);

      if (!audioContextRef.current) {
        console.error('[PcmPlayer] addAudioChunk: AudioContext not initialized. Cannot create AudioBuffer.');
        return;
      }

      const audioBuffer = audioContextRef.current.createBuffer(
        1, 
        float32Array.length, 
        sampleRate 
      );
      audioBuffer.copyToChannel(float32Array, 0);
      console.log(`[PcmPlayer] addAudioChunk: Created AudioBuffer. Duration: ${audioBuffer.duration.toFixed(3)}s`);

      // Accumulate data for "Save Last"
      // Make sure to store a copy, as float32Array might be reused or changed by Web Audio API internals
      currentResponseChunksRef.current.push(float32Array.slice()); 
      // console.log(`[PcmPlayer] Stored chunk for current response. Total chunks: ${currentResponseChunksRef.current.length}`);

      audioQueueRef.current.push(audioBuffer);
      console.log(`[PcmPlayer] addAudioChunk: Added buffer to queue. New queue size: ${audioQueueRef.current.length}`);

      if (audioContextRef.current.state === 'running') {
        if (!isPlaying) { // Only call playNextInQueue if not already in a play loop
            console.log('[PcmPlayer] addAudioChunk: Context running and not playing, initiating playNextInQueue.');
             // Reset nextPlayTimeRef if queue was empty to avoid large initial delay from previous session
            if (audioQueueRef.current.length === 1 && nextPlayTimeRef.current < audioContextRef.current.currentTime - 1) { // if first item and last play was long ago
                nextPlayTimeRef.current = audioContextRef.current.currentTime + 0.05; // Add small buffer
                console.log(`[PcmPlayer] Resetting nextPlayTime for new audio sequence to: ${nextPlayTimeRef.current.toFixed(3)}s`);
            }
            playNextInQueue();
        } else {
            console.log('[PcmPlayer] addAudioChunk: Context running but already playing/scheduled. Buffer queued.');
        }
      } else {
        console.log('[PcmPlayer] addAudioChunk: AudioContext not running. Chunk queued. Will play on context resume.');
      }

    } catch (error) {
      console.error('[PcmPlayer] Error processing audio chunk:', error);
    }
  }, [isPlaying, ensureAudioContext, playNextInQueue]);

  // Removed useEffect that called ensureAudioContext on mount.
  // ensureAudioContext will now primarily be called from App.jsx on user gestures.

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().then(() => console.log('[PcmPlayer] AudioContext closed on unmount.'));
      }
    };
  }, []);

  const clearCurrentResponseAccumulator = useCallback(() => {
    currentResponseChunksRef.current = [];
    lastCompleteResponseDataRef.current = null; // Also clear the last complete one when starting fresh
    console.log('[PcmPlayer] Cleared current response audio accumulator.');
  }, []);

  const finalizeCurrentResponse = useCallback(() => {
    if (currentResponseChunksRef.current.length > 0) {
      let totalLength = 0;
      currentResponseChunksRef.current.forEach(chunk => {
        totalLength += chunk.length;
      });

      const concatenated = new Float32Array(totalLength);
      let offset = 0;
      currentResponseChunksRef.current.forEach(chunk => {
        concatenated.set(chunk, offset);
        offset += chunk.length;
      });
      
      lastCompleteResponseDataRef.current = concatenated;
      console.log(`[PcmPlayer] Finalized current response audio. Total samples: ${totalLength}, Duration: approx ${(totalLength / sampleRate).toFixed(3)}s`);
      currentResponseChunksRef.current = []; // Clear for next response
    } else {
      console.log('[PcmPlayer] FinalizeCurrentResponse called, but no chunks to finalize.');
      lastCompleteResponseDataRef.current = null;
    }
  }, []);

  const getLastResponsePcmData = useCallback(() => {
    if (lastCompleteResponseDataRef.current) {
      console.log('[PcmPlayer] getLastResponsePcmData called, returning data.');
      return {
        pcmData: lastCompleteResponseDataRef.current,
        sampleRate: sampleRate,
        channels: 1 // Assuming mono
      };
    }
    console.log('[PcmPlayer] getLastResponsePcmData called, but no data available.');
    return null;
  }, []);


  return { 
    addAudioChunk, 
    ensureAudioContext, 
    isPlaying, 
    isContextStarted,
    analyserNode: analyserNodeRef.current, // Expose AnalyserNode
    clearCurrentResponseAccumulator,
    finalizeCurrentResponse,
    getLastResponsePcmData
  };
}
