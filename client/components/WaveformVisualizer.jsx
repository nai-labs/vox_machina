import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "react-feather";

// Browser detection utility
const isSafari = () => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

export default function WaveformVisualizer({ audioStream, isMicMuted, toggleMicMute }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const rotationRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // Performance settings based on browser
  const performanceSettings = {
    safari: {
      targetFPS: 30, // Reduced from 60
      fftSize: 256, // Reduced from 512
      smoothingTimeConstant: 0.9, // Increased for smoother animation
      skipFrames: 1, // Skip every other frame
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

  // Set up the audio analyzer when the component mounts or when the audio stream changes
  useEffect(() => {
    if (!audioStream) return;

    // Create audio context and analyzer if they don't exist
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = settings.fftSize;
      analyserRef.current.smoothingTimeConstant = settings.smoothingTimeConstant;
    }

    // Connect the audio stream to the analyzer
    const source = audioContextRef.current.createMediaStreamSource(audioStream);
    source.connect(analyserRef.current);

    // Clean up function
    return () => {
      if (source) {
        source.disconnect();
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioStream, settings.fftSize, settings.smoothingTimeConstant]);

  // Handle canvas resizing
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        const { width, height } = container.getBoundingClientRect();
        setCanvasSize({ width, height });
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
    };

    // Initial size
    updateCanvasSize();

    // Add resize listener
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Draw the radial visualization
  useEffect(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Calculate center of the canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Calculate the radius based on the smaller dimension
    const maxRadius = Math.min(centerX, centerY) * 0.85;

    const draw = (currentTime) => {
      frameCountRef.current++;
      
      // Frame rate limiting for performance
      if (currentTime - lastFrameTimeRef.current < 1000 / settings.targetFPS) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      
      // Skip frames for Safari performance
      if (settings.skipFrames > 0 && frameCountRef.current % (settings.skipFrames + 1) !== 0) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      
      lastFrameTimeRef.current = currentTime;
      
      // Clear the canvas with a fade effect
      ctx.fillStyle = 'rgba(10, 14, 23, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw background effects (simplified for Safari)
      if (!settings.simplifiedEffects) {
        drawCyberpunkGrid(ctx, canvas.width, canvas.height);
      }
      
      // Get the frequency data
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Slower rotation for better performance
      rotationRef.current += settings.simplifiedEffects ? 0.001 : 0.002;
      
      // Draw the circular visualization
      drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius);
      
      // Add effects (simplified for Safari)
      if (!settings.simplifiedEffects) {
        drawScanLines(ctx, canvas.width, canvas.height, centerX, centerY);
        drawWatermark(ctx, canvas.width, canvas.height);
      }
      
      // Continue the animation
      animationRef.current = requestAnimationFrame(draw);
    };
    
    // Function to draw cyberpunk grid background (only for non-Safari)
    function drawCyberpunkGrid(ctx, width, height) {
      const gridSize = 40;
      const gridOpacity = 0.05; // Reduced opacity for better performance
      
      ctx.strokeStyle = `rgba(10, 255, 255, ${gridOpacity})`;
      ctx.lineWidth = 0.5;
      
      // Draw fewer grid lines for performance
      for (let y = 0; y < height; y += gridSize * 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      for (let x = 0; x < width; x += gridSize * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
    
    // Function to draw scan lines (simplified for Safari)
    function drawScanLines(ctx, width, height, centerX, centerY) {
      // Only horizontal scan line for performance
      const scanLineY = (Date.now() % 5000) / 5000 * height;
      ctx.fillStyle = 'rgba(10, 255, 255, 0.1)';
      ctx.fillRect(0, scanLineY, width, 1);
    }
    
    // Function to draw a subtle watermark
    function drawWatermark(ctx, width, height) {
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(10, 255, 255, 1)';
      ctx.textAlign = 'center';
      ctx.fillText('VOX MACHINA', width / 2, height - 15);
      ctx.restore();
    }
    
    // Function to draw the radial visualization (optimized)
    function drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius) {
      // Use fewer bars for better performance
      const numBars = settings.simplifiedEffects ? 
        Math.floor(dataArray.length / 4) : 
        Math.floor(dataArray.length / 2);
      
      const angleStep = (Math.PI * 2) / numBars;
      const isActive = true;
      const baseRadius = maxRadius * 0.3;
      
      // Simplified outer circle (only for non-Safari)
      if (!settings.simplifiedEffects) {
        ctx.strokeStyle = 'rgba(10, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Inner circle
      ctx.strokeStyle = 'rgba(0, 170, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Reduced glow effect for Safari
      if (!settings.simplifiedEffects) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(10, 255, 255, 0.5)';
      }
      
      // Draw the bars with reduced complexity
      for (let i = 0; i < numBars; i++) {
        const dataIndex = settings.simplifiedEffects ? i * 4 : i * 2;
        const amplitude = dataArray[dataIndex] / 255;
        
        // Calculate dynamic radius based on audio data
        const barHeight = baseRadius + (amplitude * (maxRadius - baseRadius));
        
        // Calculate angle with rotation
        const angle = i * angleStep + rotationRef.current;
        
        // Calculate start and end points
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * barHeight;
        const endY = centerY + Math.sin(angle) * barHeight;
        
        // Simplified colors for Safari
        if (settings.simplifiedEffects) {
          ctx.strokeStyle = `rgba(10, 255, 255, ${0.4 + amplitude * 0.4})`;
          ctx.lineWidth = 1 + amplitude;
        } else {
          // Create gradient for the lines
          const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
          gradient.addColorStop(0, 'rgba(0, 170, 255, 0.7)');
          gradient.addColorStop(1, 'rgba(10, 255, 255, 0.9)');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1 + amplitude * 2;
        }
        
        // Draw the line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Add dots only for high amplitude and non-Safari
        if (!settings.simplifiedEffects && amplitude > 0.6) {
          ctx.fillStyle = 'rgba(10, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(endX, endY, 1 + amplitude * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Simplified center circle
      ctx.fillStyle = settings.simplifiedEffects ? 
        'rgba(10, 255, 255, 0.2)' : 
        'rgba(10, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      // Reset shadow
      ctx.shadowBlur = 0;
    }

    // Start the animation
    animationRef.current = requestAnimationFrame(draw);

    // Clean up
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [canvasSize, settings]);

  return (
    <div className="waveform-container w-full h-full relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full rounded"
      />
      
      {/* Performance indicator for Safari */}
      {isSafari() && (
        <div className="absolute top-2 left-2 text-xs text-neon-secondary opacity-50">
          SAFARI OPTIMIZED
        </div>
      )}
      
      {/* Microphone Mute Button */}
      {toggleMicMute && (
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
