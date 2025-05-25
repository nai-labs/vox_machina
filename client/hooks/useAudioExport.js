import { useState, useCallback } from 'react';

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

          // For 'full' export, check if the data is too large (optional, as per original logic)
          if (exportType === 'full' && base64data.length > 10000000) { // ~10MB limit
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
              audioData: base64data,
              exportType: exportType,
              character: character,
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

  return {
    isExporting,
    exportStatus,
    exportLastAudio,
    exportFullAudio
  };
}
