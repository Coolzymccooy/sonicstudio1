import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isPlaying: boolean;
  color?: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, color = '#22d3ee' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const bars = 20;
    
    const render = () => {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width / bars;
      
      for (let i = 0; i < bars; i++) {
        // Random height if playing, else low static
        const height = isPlaying 
          ? Math.random() * canvas.height * 0.8 
          : Math.random() * 5 + 2;
          
        ctx.fillStyle = color;
        // Add some transparency
        ctx.globalAlpha = 0.7;
        
        // Draw rounded bar
        const x = i * width + 2;
        const y = (canvas.height - height) / 2; // Centered
        
        ctx.beginPath();
        ctx.roundRect(x, y, width - 4, height, 4);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full h-full"
    />
  );
};