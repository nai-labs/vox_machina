import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "react-feather";

// Browser detection utility
const isSafari = () => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

export default function WaveformVisualizer({ audioStream, analyserNode, isMicMuted, toggleMicMute }) { // Added analyserNode prop
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const localAnalyserRef = useRef(null); // Renamed to avoid conflict if prop is also named analyserRef
  const audioContextRef = useRef(null); // To store context if created internally
  const sourceNodeRef = useRef(null); // To store MediaStreamSourceNode if created internally

  const rotationRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  const performanceSettings = {
    safari: {
      targetFPS: 30,
      fftSize: 256,
      smoothingTimeConstant: 0.9,
      skipFrames: 1,
      simplifiedEffects: true
    },
    other: {
      targetFPS: 60,
      fftSize: 512,
      smoothingTimeConstant: 0.85,
      skipFrames: 0,
      simplifiedEffects: false
    }
  };

  const settings = isSafari() ? performanceSettings.safari : performanceSettings.other;

  useEffect(() => {
    if (analyserNode) { // If an analyserNode is passed as a prop (e.g., from usePcmPlayer for Gemini)
      console.log("[WaveformVisualizer] Using provided AnalyserNode.");
      localAnalyserRef.current = analyserNode;
      // Ensure fftSize and smoothingTimeConstant from settings are applied if possible,
      // though the provided node might already be configured.
      if (localAnalyserRef.current.fftSize !== settings.fftSize) {
        try { localAnalyserRef.current.fftSize = settings.fftSize; } catch(e) { console.warn("Could not set fftSize on provided analyser", e)}
      }
      if (localAnalyserRef.current.smoothingTimeConstant !== settings.smoothingTimeConstant) {
        try {localAnalyserRef.current.smoothingTimeConstant = settings.smoothingTimeConstant; } catch(e) { console.warn("Could not set smoothingTimeConstant on provided analyser", e)}
      }
    } else if (audioStream) { // Existing logic for OpenAI (MediaStream)
      console.log("[WaveformVisualizer] Using audioStream to create AnalyserNode.");
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sourceNodeRef.current) { // Disconnect previous source if any
        sourceNodeRef.current.disconnect();
      }
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
      localAnalyserRef.current = audioContextRef.current.createAnalyser();
      localAnalyserRef.current.fftSize = settings.fftSize;
      localAnalyserRef.current.smoothingTimeConstant = settings.smoothingTimeConstant;
      sourceNodeRef.current.connect(localAnalyserRef.current);
      // For OpenAI, we don't connect analyser to destination as it's for visualization of output stream.
    } else {
      localAnalyserRef.current = null; // No source, no analyser
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceNodeRef.current) { // Only disconnect if we created it
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      // Don't close audioContextRef or localAnalyserRef if it was passed as a prop (analyserNode)
      // The component that created it (e.g., usePcmPlayer) is responsible for its lifecycle.
      // If we created the context (for audioStream), we could close it, but often it's shared or managed by App.
    };
  }, [audioStream, analyserNode, settings.fftSize, settings.smoothingTimeConstant]);


  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        if (container) {
            const { width, height } = container.getBoundingClientRect();
            setCanvasSize({ width, height });
            canvasRef.current.width = width;
            canvasRef.current.height = height;
        }
      }
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  useEffect(() => {
    if (!localAnalyserRef.current || !canvasRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = localAnalyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY) * 0.85;

    const draw = (currentTime) => {
      animationRef.current = requestAnimationFrame(draw); // Request next frame first
      frameCountRef.current++;
      
      if (currentTime - lastFrameTimeRef.current < 1000 / settings.targetFPS) {
        return;
      }
      
      if (settings.skipFrames > 0 && frameCountRef.current % (settings.skipFrames + 1) !== 0) {
        return;
      }
      
      lastFrameTimeRef.current = currentTime;
      
      ctx.fillStyle = 'rgba(10, 14, 23, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (!settings.simplifiedEffects) {
        drawCyberpunkGrid(ctx, canvas.width, canvas.height);
      }
      
      localAnalyserRef.current.getByteFrequencyData(dataArray);
      rotationRef.current += settings.simplifiedEffects ? 0.001 : 0.002;
      drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius);
      
      if (!settings.simplifiedEffects) {
        drawScanLines(ctx, canvas.width, canvas.height); // Removed centerX, centerY as they were unused
        drawWatermark(ctx, canvas.width, canvas.height);
      }
    };
    
    function drawCyberpunkGrid(ctx, width, height) {
      const gridSize = 40;
      const gridOpacity = 0.05;
      ctx.strokeStyle = `rgba(10, 255, 255, ${gridOpacity})`;
      ctx.lineWidth = 0.5;
      for (let y = 0; y < height; y += gridSize * 2) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      for (let x = 0; x < width; x += gridSize * 2) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
    }
    
    function drawScanLines(ctx, width, height) {
      const scanLineY = (Date.now() % 5000) / 5000 * height;
      ctx.fillStyle = 'rgba(10, 255, 255, 0.1)';
      ctx.fillRect(0, scanLineY, width, 1);
    }
    
    function drawWatermark(ctx, width, height) {
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(10, 255, 255, 1)';
      ctx.textAlign = 'center';
      ctx.fillText('VOX MACHINA', width / 2, height - 15);
      ctx.restore();
    }
    
    function drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius) {
      const numBars = settings.simplifiedEffects ? Math.floor(dataArray.length / 4) : Math.floor(dataArray.length / 2);
      const angleStep = (Math.PI * 2) / numBars;
      const baseRadius = maxRadius * 0.3;
      
      if (!settings.simplifiedEffects) {
        ctx.strokeStyle = 'rgba(10, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2); ctx.stroke();
      }
      
      ctx.strokeStyle = 'rgba(0, 170, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2); ctx.stroke();
      
      if (!settings.simplifiedEffects) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(10, 255, 255, 0.5)';
      }
      
      for (let i = 0; i < numBars; i++) {
        const dataIndex = settings.simplifiedEffects ? i * 4 : i * 2;
        const amplitude = dataArray[dataIndex] / 255;
        const barHeight = baseRadius + (amplitude * (maxRadius - baseRadius));
        const angle = i * angleStep + rotationRef.current;
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * barHeight;
        const endY = centerY + Math.sin(angle) * barHeight;
        
        if (settings.simplifiedEffects) {
          ctx.strokeStyle = `rgba(10, 255, 255, ${0.4 + amplitude * 0.4})`;
          ctx.lineWidth = 1 + amplitude;
        } else {
          const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
          gradient.addColorStop(0, 'rgba(0, 170, 255, 0.7)');
          gradient.addColorStop(1, 'rgba(10, 255, 255, 0.9)');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1 + amplitude * 2;
        }
        
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
        
        if (!settings.simplifiedEffects && amplitude > 0.6) {
          ctx.fillStyle = 'rgba(10, 255, 255, 0.8)';
          ctx.beginPath(); ctx.arc(endX, endY, 1 + amplitude * 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      
      ctx.fillStyle = settings.simplifiedEffects ? 'rgba(10, 255, 255, 0.2)' : 'rgba(10, 255, 255, 0.4)';
      ctx.beginPath(); ctx.arc(centerX, centerY, baseRadius * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    animationRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [canvasSize, settings, audioStream, analyserNode]); // Added audioStream and analyserNode to re-trigger draw setup if they change

  return (
    <div className="waveform-container w-full h-full relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full rounded"
      />
      
      {isSafari() && (
        <div className="absolute top-2 left-2 text-xs text-neon-secondary opacity-50">
          SAFARI OPTIMIZED
        </div>
      )}
      
      {toggleMicMute && ( // Only show mic mute if toggleMicMute is provided (relevant for OpenAI input stream viz)
        <button 
          onClick={toggleMicMute}
          className={`absolute bottom-4 right-4 terminal-button p-2 z-30 transition-all duration-300 ${
            isMicMuted 
              ? "bg-cyber-dark border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]" 
              : "bg-cyber-dark border-neon-primary shadow-neon-glow"
          }`}
          title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMicMuted ? (
            <MicOff size={20} className="text-red-500" />
          ) : (
            <Mic size={20} className="text-neon-primary" />
          )}
        </button>
      )}
    </div>
  );
}
