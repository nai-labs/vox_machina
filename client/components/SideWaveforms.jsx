import { useEffect, useRef } from "react";

export default function SideWaveforms({ isActive = false, side = "left" }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const columnsRef = useRef([]);
  const wavebandsRef = useRef([]);
  
  // Character sets
  const binaryChars = ['0', '1'];
  const hexChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
  const symbolChars = ['⌀', '∆', '◊', '□', '∞', '≈', '≠', '≤', '≥', '⌂', '⌘', '⌥', '⌦', '⌫', '⎋', '⏏'];
  
  // Set up the canvas and animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const parentElement = canvas.parentElement;
    
    // Resize canvas to match parent element
    const resizeCanvas = () => {
      canvas.width = parentElement.offsetWidth;
      canvas.height = parentElement.offsetHeight;
      
      // Reinitialize columns when canvas size changes
      initializeColumns(canvas.width, canvas.height);
      initializeWaveBands(canvas.width, canvas.height);
    };
    
    // Initial resize
    resizeCanvas();
    
    // Add resize listener
    window.addEventListener('resize', resizeCanvas);
    
    // Animation variables
    let time = 0;
    const baseSpeed = isActive ? 2 : 1;
    
    // Draw function
    const draw = () => {
      // Clear canvas with fade effect for trail
      ctx.fillStyle = 'rgba(0, 10, 15, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Update time
      time += 0.016; // Approximately 60fps
      
      // Draw background grid
      drawGrid(ctx, canvas.width, canvas.height);
      
      // Draw horizontal wave bands
      drawWaveBands(ctx, canvas.width, canvas.height, time, baseSpeed);
      
      // Draw digital rain columns
      drawColumns(ctx, canvas.width, canvas.height, time, baseSpeed);
      
      // Draw scan line and frequency markers
      drawScanEffects(ctx, canvas.width, canvas.height, time);
      
      // Draw glow overlay
      drawGlowOverlay(ctx, canvas.width, canvas.height, time);
      
      // Continue animation
      animationRef.current = requestAnimationFrame(draw);
    };
    
    // Initialize digital rain columns - full width grid
    function initializeColumns(width, height) {
      columnsRef.current = [];
      
      // Column width - make them packed tightly
      const columnWidth = 8; // pixels between columns
      const numColumns = Math.ceil(width / columnWidth);
      
      for (let i = 0; i < numColumns; i++) {
        // Create a column with properties
        const column = {
          x: i * columnWidth,
          y: Math.random() * height,
          speed: Math.random() * 1.5 + 0.5,
          length: Math.floor(Math.random() * 15) + 5,
          chars: [],
          type: Math.random() < 0.7 ? 'binary' : (Math.random() < 0.5 ? 'hex' : 'symbol'),
          size: Math.floor(Math.random() * 3) + 6, // Font size between 6-8px
          opacity: Math.random() * 0.3 + 0.2, // Lower base opacity
          active: Math.random() < 0.7, // Some columns start inactive
          activationTime: Math.random() * 10, // Random activation time
          glitchInterval: Math.random() * 2 + 1,
          lastGlitch: 0
        };
        
        // Initialize characters
        for (let j = 0; j < column.length; j++) {
          column.chars.push(getRandomChar(column.type));
        }
        
        columnsRef.current.push(column);
      }
    }
    
    // Initialize horizontal wave bands
    function initializeWaveBands(width, height) {
      wavebandsRef.current = [];
      
      // Create 5-10 wave bands
      const numBands = Math.floor(Math.random() * 5) + 5;
      
      for (let i = 0; i < numBands; i++) {
        const band = {
          y: Math.random() * height,
          height: Math.random() * 20 + 5,
          speed: (Math.random() * 0.5 + 0.1) * (Math.random() < 0.5 ? 1 : -1), // Some move up, some down
          amplitude: Math.random() * 10 + 5,
          frequency: Math.random() * 0.05 + 0.01,
          phase: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.2 + 0.1
        };
        
        wavebandsRef.current.push(band);
      }
    }
    
    // Get random character based on type
    function getRandomChar(type) {
      switch (type) {
        case 'binary':
          return binaryChars[Math.floor(Math.random() * binaryChars.length)];
        case 'hex':
          return hexChars[Math.floor(Math.random() * hexChars.length)];
        case 'symbol':
          return symbolChars[Math.floor(Math.random() * symbolChars.length)];
        default:
          return '0';
      }
    }
    
    // Draw all digital rain columns
    function drawColumns(ctx, width, height, time, baseSpeed) {
      columnsRef.current.forEach((column, index) => {
        // Check if column should be active
        if (!column.active) {
          if (time > column.activationTime) {
            column.active = true;
          } else {
            return; // Skip inactive columns
          }
        }
        
        // Update column position
        column.y += column.speed * baseSpeed;
        
        // Reset column if it goes off screen
        if (column.y - column.length * column.size > height) {
          column.y = -column.length * column.size;
          column.speed = Math.random() * 1.5 + 0.5;
          
          // Occasionally change column type
          if (Math.random() < 0.1) {
            column.type = Math.random() < 0.7 ? 'binary' : (Math.random() < 0.5 ? 'hex' : 'symbol');
            // Reinitialize characters
            for (let j = 0; j < column.length; j++) {
              column.chars[j] = getRandomChar(column.type);
            }
          }
        }
        
        // Glitch effect - occasionally change characters
        if (time - column.lastGlitch > column.glitchInterval) {
          const charIndex = Math.floor(Math.random() * column.chars.length);
          column.chars[charIndex] = getRandomChar(column.type);
          column.lastGlitch = time;
        }
        
        // Draw the column
        drawColumn(ctx, column, time, side, width);
      });
    }
    
    // Draw a single digital rain column
    function drawColumn(ctx, column, time, side, width) {
      // Calculate x position based on side
      let xPos = column.x;
      if (side === 'right') {
        xPos = width - column.x;
      }
      
      // Draw characters in the column
      for (let i = 0; i < column.chars.length; i++) {
        const y = column.y - i * column.size;
        
        // Skip if off screen
        if (y < -column.size || y > canvas.height) continue;
        
        // Calculate opacity (fade out for trailing characters)
        const charOpacity = column.opacity * (1 - i / column.length);
        
        // Determine character color based on position in column
        let color;
        if (i === 0) {
          // Head of column is brightest
          color = `rgba(10, 255, 255, ${charOpacity * 2})`; // Brighter head
        } else if (i < 3) {
          // First few characters are slightly dimmer
          color = `rgba(0, 200, 255, ${charOpacity * 1.5})`;
        } else {
          // Rest of characters are much dimmer
          color = `rgba(0, 170, 255, ${charOpacity})`;
        }
        
        // Set font and color
        ctx.font = `${column.size}px "Share Tech Mono", monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center'; // Center align for better distribution
        
        // Draw the character
        ctx.fillText(column.chars[i], xPos, y);
      }
    }
    
    // Draw horizontal wave bands
    function drawWaveBands(ctx, width, height, time, baseSpeed) {
      wavebandsRef.current.forEach(band => {
        // Update band position
        band.y += band.speed * baseSpeed;
        
        // Wrap around if off screen
        if (band.y < -band.height) {
          band.y = height + band.height;
        } else if (band.y > height + band.height) {
          band.y = -band.height;
        }
        
        // Draw the wave band
        ctx.strokeStyle = `rgba(10, 255, 255, ${band.opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Draw a wavy line across the width
        for (let x = 0; x < width; x++) {
          const waveY = band.y + Math.sin((time + x * band.frequency) * 2 + band.phase) * band.amplitude;
          
          if (x === 0) {
            ctx.moveTo(x, waveY);
          } else {
            ctx.lineTo(x, waveY);
          }
        }
        
        ctx.stroke();
        
        // Occasionally add data points along the wave
        if (Math.random() < 0.01) {
          const dataX = Math.random() * width;
          const dataY = band.y + Math.sin((time + dataX * band.frequency) * 2 + band.phase) * band.amplitude;
          
          ctx.fillStyle = `rgba(0, 255, 200, ${band.opacity * 3})`;
          ctx.beginPath();
          ctx.arc(dataX, dataY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    
    // Draw grid background
    function drawGrid(ctx, width, height) {
      const gridSize = 20;
      ctx.strokeStyle = 'rgba(10, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      
      // Draw vertical grid lines
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.setLineDash([2, 2]); // Dashed line
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.setLineDash([2, 2]); // Dashed line
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Reset line dash
      ctx.setLineDash([]);
    }
    
    // Draw scan line and frequency markers
    function drawScanEffects(ctx, width, height, time) {
      // Horizontal scan line
      const scanLineY = (time * 100) % height;
      ctx.fillStyle = 'rgba(10, 255, 255, 0.15)';
      ctx.fillRect(0, scanLineY, width, 1);
      
      // Occasionally draw a frequency marker
      if (Math.random() < 0.005) {
        const freqY = Math.random() * height;
        const freqValue = Math.floor(Math.random() * 20000);
        ctx.font = '8px "Share Tech Mono", monospace';
        ctx.fillStyle = 'rgba(0, 255, 200, 0.7)';
        ctx.textAlign = side === 'left' ? 'left' : 'right';
        const freqX = side === 'left' ? 5 : width - 5;
        ctx.fillText(`${freqValue}Hz`, freqX, freqY);
        
        // Draw a horizontal marker line
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(0, freqY);
        ctx.lineTo(width, freqY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw dB value occasionally
      if (Math.random() < 0.002) {
        const dbY = Math.random() * height;
        const dbValue = Math.floor(Math.random() * 60) - 60; // Random dB value between -60 and 0
        ctx.font = '8px "Share Tech Mono", monospace';
        ctx.fillStyle = 'rgba(0, 255, 200, 0.7)';
        ctx.textAlign = side === 'left' ? 'left' : 'right';
        const dbX = side === 'left' ? 5 : width - 5;
        ctx.fillText(`${dbValue}dB`, dbX, dbY);
      }
    }
    
    // Draw glow overlay
    function drawGlowOverlay(ctx, width, height, time) {
      // Create gradient based on side
      const gradient = ctx.createLinearGradient(
        side === 'left' ? 0 : width,
        0,
        side === 'left' ? width : 0,
        0
      );
      
      // Add glow effect that pulses with time
      const glowIntensity = 0.1 + Math.sin(time) * 0.05;
      gradient.addColorStop(0, `rgba(10, 255, 255, ${glowIntensity})`);
      gradient.addColorStop(0.2, 'rgba(0, 170, 255, 0.05)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Add occasional vertical "data burst" lines
      if (Math.random() < 0.02) {
        const burstX = Math.random() * width;
        ctx.strokeStyle = 'rgba(10, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(burstX, 0);
        ctx.lineTo(burstX, height);
        ctx.stroke();
      }
    }
    
    // Start animation
    draw();
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, side]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
    />
  );
}
