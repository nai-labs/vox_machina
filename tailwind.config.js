/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/**/*.{jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'cyber-dark': '#001a1a',
        'cyber-medium': '#1a1f2e',
        'cyber-light': '#2a3040',
        'cyber-text': '#c5e1ff',
        'neon-primary': '#0affff',
        'neon-secondary': '#00aaff',
        'neon-tertiary': '#ff00aa',
        'cyber-user': '#0affff',
        'cyber-ai': '#00aaff'
      },
      boxShadow: {
        'neon-primary': '0 0 5px #0affff, 0 0 10px #0affff',
        'neon-secondary': '0 0 5px #00aaff, 0 0 10px #00aaff',
        'neon-tertiary': '0 0 5px #ff00aa, 0 0 10px #ff00aa',
        'neon-glow': '0 0 15px rgba(10, 255, 255, 0.7)'
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      fontFamily: {
        'cyber': ['"Share Tech Mono"', 'Consolas', '"Andale Mono"', 'monospace']
      },
      borderWidth: {
        '1': '1px'
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'border-pulse': 'borderPulse 1.5s infinite ease-in-out',
        'text-shadow-pulse': 'textShadowPulse 2s infinite ease-in-out',
        'scanline': 'scanline 8s linear infinite',
        'glitch': 'glitch 3s infinite linear alternate-reverse',
        'pulse-subtle': 'pulse 4s infinite ease-in-out',
        'float': 'float 10s infinite linear',
        'typing': 'typing 1s steps(30, end) forwards'
      }
    },
  },
  plugins: [],
};
