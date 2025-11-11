import { useState, useCallback } from 'react';

// Helper function to write string to DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Helper function to convert Float32Array PCM to WAV Blob
function pcmFloat32ToWavBlob(float32PcmArray, sampleRate, numChannels) {
  const pcm16 = new Int16Array(float32PcmArray.length);
  for (let i = 0; i < float32PcmArray.length; i++) {
    let s = Math.max(-1, Math.min(1, float32PcmArray[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const buffer = new ArrayBuffer(44 + pcm16.length * 2); // 44 bytes for header, 2 bytes per sample for 16-bit
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm16.length * 2, true); // ChunkSize
  writeString(view, 8, 'WAVE');
  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);  // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);   // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  // DATA sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcm16.length * 2, true); // Subchunk2Size

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}


export function useAudioExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);

  // Unified export function that works for both WebM and WAV blobs
  const exportAudioBlob = useCallback(async (audioBlob, exportType, character, sourceFormat = 'webm') => {
    if (!audioBlob || audioBlob.size === 0) {
      console.log(`No audio data to export for type: ${exportType}`);
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }

    setIsExporting(true);
    setExportStatus(`Exporting ${exportType === 'last' ? 'last response' : 'full conversation'}...`);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        try {
          let base64data = reader.result;
          if (!base64data) {
            throw new Error("FileReader resulted in null or undefined data.");
          }

          // Check for very large exports and handle appropriately
          if (exportType === 'full' && base64data.length > 50000000) { // 50MB limit
            console.warn(`Audio data for 'full' export is very large (${(base64data.length / 1000000).toFixed(1)}MB). This may take longer to process.`);
            setExportStatus("Processing large file - this may take a moment...");
          }
          
          console.log(`Sending ${exportType} audio data to /save-audio. Format: ${sourceFormat}, Length: ${base64data.length}`);

          const response = await fetch('/save-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audioData: base64data,
              exportType: exportType,
              character: character,
              sourceFormat: sourceFormat // Now supports both 'webm' and 'wav'
            }),
          });

          const result = await response.json();
          console.log(`Server response for ${exportType} export:`, result);

          if (result.success) {
            // Enhanced file reporting with health check info
            const files = [];
            if (result.mp3 && result.mp3.filename) files.push(`MP3: ${result.mp3.filename}`);
            if (result.wav && result.wav.filename) files.push(`WAV: ${result.wav.filename}`);
            if (result.source && result.source.filename) files.push(`${result.source.format.toUpperCase()}: ${result.source.filename}`);
            
            if (files.length > 0) {
              console.log(`${exportType === 'last' ? 'Last audio response' : 'Full audio conversation'} saved:`, files);
              
              // Show appropriate status based on health check
              if (result.healthCheck) {
                switch (result.healthCheck.overall) {
                  case 'excellent':
                    setExportStatus(`✅ All formats saved: ${files.length} files`);
                    break;
                  case 'partial':
                    setExportStatus(`⚠️ Partially saved: ${files.length} files (check console)`);
                    break;
                  case 'failed':
                    setExportStatus(`❌ Export issues detected (check console)`);
                    break;
                  default:
                    setExportStatus(`Saved: ${files.length} files`);
                }
              } else {
                setExportStatus(`Saved: ${files.join(', ')}`);
              }
              
              setTimeout(() => setExportStatus(null), 5000);
            } else {
              setExportStatus("Export completed but no output files reported");
              setTimeout(() => setExportStatus(null), 3000);
            }
            
            // Enhanced warning/health check reporting
            if (result.warning || (result.healthCheck && result.healthCheck.errors.length > 0)) {
              const warnings = [];
              if (result.warning) warnings.push(result.warning);
              if (result.healthCheck && result.healthCheck.errors.length > 0) {
                warnings.push(...result.healthCheck.errors);
              }
              
              console.warn(`Export warnings:`, warnings);
              if (result.healthCheck && result.healthCheck.recommendations.length > 0) {
                console.info('Recommendations:', result.healthCheck.recommendations);
              }
              
              setTimeout(() => {
                setExportStatus(`⚠️ Export completed with warnings (see console)`);
                setTimeout(() => setExportStatus(null), 4000);
              }, 5500);
            }
          } else {
            console.error(`Server returned error for ${exportType} export:`, result.error);
            setExportStatus(`❌ Export failed: ${result.error || 'Unknown server error'}`);
            setTimeout(() => setExportStatus(null), 5000);
          }
        } catch (error) {
          console.error(`Error processing audio or fetching for ${exportType} export:`, error);
          setExportStatus(`❌ Export failed: ${error.message}`);
          setTimeout(() => setExportStatus(null), 5000);
        } finally {
          setIsExporting(false);
        }
      };

      reader.onerror = (error) => {
        console.error(`FileReader error for ${exportType} export:`, error);
        setIsExporting(false);
        setExportStatus("❌ Export failed: Client-side file reading error");
        setTimeout(() => setExportStatus(null), 5000);
      };
    } catch (error) {
      console.error(`Error in exportAudioBlob for ${exportType}:`, error);
      setIsExporting(false);
      setExportStatus(`❌ Export failed: ${error.message}`);
      setTimeout(() => setExportStatus(null), 5000);
    }
  }, []);

  // OpenAI WebRTC audio export (WebM format)
  const exportLastAudio = useCallback(async (lastMessageAudio, character) => {
    console.log("Attempting to export last audio response...");
    if (!lastMessageAudio || lastMessageAudio.size === 0) {
      console.log("No last message audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    await exportAudioBlob(lastMessageAudio, 'last', character, 'webm');
  }, [exportAudioBlob]);

  const exportFullAudio = useCallback(async (fullAudioResponse, character) => {
    console.log("Attempting to export full AI audio conversation...");
    if (!fullAudioResponse || fullAudioResponse.size === 0) {
      console.log("No full conversation audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    await exportAudioBlob(fullAudioResponse, 'full', character, 'webm');
  }, [exportAudioBlob]);

  // Gemini WAV audio export 
  const exportWavAudio = useCallback(async (wavBlob, exportType, character) => {
    console.log(`Attempting to export ${exportType} WAV audio...`);
    if (!wavBlob || wavBlob.size === 0) {
      console.log(`No ${exportType} WAV audio available or size is 0 for export.`);
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    await exportAudioBlob(wavBlob, exportType, character, 'wav');
  }, [exportAudioBlob]);

  return {
    isExporting,
    exportStatus,
    exportLastAudio,      // For OpenAI WebRTC (WebM)
    exportFullAudio,      // For OpenAI WebRTC (WebM)
    exportWavAudio,       // For Gemini WAV blobs
    exportAudioBlob       // Generic export function
  };
}
