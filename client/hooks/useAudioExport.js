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

  const exportAudioBlob = useCallback(async (audioBlob, exportType, filenamePrefix, character) => {
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

          if (exportType === 'full' && base64data.length > 10000000) { 
            console.log("Audio data for 'full' export is too large, trimming to last 10MB of data.");
            base64data = base64data.substring(base64data.length - 10000000);
          }
          
          console.log(`Sending ${exportType} audio data to /save-audio. Length: ${base64data.length}`);

          const response = await fetch('/save-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audioData: base64data, // This is base64 WebM for OpenAI
              exportType: exportType,
              character: character,
              sourceFormat: 'webm' // Indicate original format for server
            }),
          });

          const result = await response.json();
          console.log(`Server response for ${exportType} export:`, result);

          if (result.success && result.mp3 && result.mp3.filename) {
            console.log(`${exportType === 'last' ? 'Last audio response' : 'Full audio conversation'} saved as ${result.mp3.filename}`);
            setExportStatus(`Saved as ${result.mp3.filename}`);
            setTimeout(() => setExportStatus(null), 3000);
          } else {
            console.error(`Server returned error for ${exportType} export:`, result.error);
            setExportStatus(`Export failed: ${result.error || 'Unknown server error'}`);
            setTimeout(() => setExportStatus(null), 5000);
          }
        } catch (error) {
          console.error(`Error processing audio or fetching for ${exportType} export:`, error);
          setExportStatus(`Export failed: ${error.message}`);
          setTimeout(() => setExportStatus(null), 5000);
        } finally {
          setIsExporting(false);
        }
      };

      reader.onerror = (error) => {
        console.error(`FileReader error for ${exportType} export:`, error);
        setIsExporting(false);
        setExportStatus("Export failed: Client-side file reading error");
        setTimeout(() => setExportStatus(null), 5000);
      };
    } catch (error) {
      console.error(`Error in exportAudioBlob for ${exportType}:`, error);
      setIsExporting(false);
      setExportStatus(`Export failed: ${error.message}`);
      setTimeout(() => setExportStatus(null), 5000);
    }
  }, []);

  const exportLastAudio = useCallback(async (lastMessageAudio, character) => {
    console.log("Attempting to export last audio response...");
    if (!lastMessageAudio || lastMessageAudio.size === 0) {
      console.log("No last message audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    await exportAudioBlob(lastMessageAudio, 'last', 'last_ai_response', character);
  }, [exportAudioBlob]);

  const exportFullAudio = useCallback(async (lastAudioResponse, character) => {
    console.log("Attempting to export full AI audio conversation...");
    if (!lastAudioResponse || lastAudioResponse.size === 0) {
      console.log("No full conversation audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    await exportAudioBlob(lastAudioResponse, 'full', 'full_ai_conversation', character);
  }, [exportAudioBlob]);

  const exportPcmDataAsWav = useCallback(async (float32PcmArray, sampleRateVal, numChannelsVal, character, exportNamePrefix = 'gemini-response') => {
    if (!float32PcmArray || float32PcmArray.length === 0) {
      console.log("[AudioExport] No PCM data to export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }

    setIsExporting(true);
    setExportStatus(`Exporting ${exportNamePrefix}...`);
    console.log(`[AudioExport] Exporting PCM data as WAV. Samples: ${float32PcmArray.length}, SampleRate: ${sampleRateVal}, Channels: ${numChannelsVal}`);

    try {
      const wavBlob = pcmFloat32ToWavBlob(float32PcmArray, sampleRateVal, numChannelsVal);
      
      // Option 1: Direct WAV download (client-side only)
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const timestamp = `${date}_${time}`;
      const characterName = character?.name?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown-character';
      const filename = `vox-machina_${characterName}_${exportNamePrefix}_${timestamp}.wav`;

      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log(`[AudioExport] WAV file "${filename}" download initiated.`);
      setExportStatus(`Saved as ${filename}`);
      setTimeout(() => setExportStatus(null), 3000);

      // Option 2: Send WAV to server for MP3 conversion (if desired later)
      /*
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onloadend = async () => {
        const base64WavData = reader.result;
        // ... send base64WavData to /save-audio with a new 'sourceFormat: 'wav'' field ...
        // ... server would need to handle this new sourceFormat ...
      };
      */

    } catch (error) {
      console.error('[AudioExport] Error exporting PCM data as WAV:', error);
      setExportStatus(`Export failed: ${error.message}`);
      setTimeout(() => setExportStatus(null), 5000);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return {
    isExporting,
    exportStatus,
    exportLastAudio,
    exportFullAudio,
    exportPcmDataAsWav // Added new function
  };
}
