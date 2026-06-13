import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Moon, X, Palette, Undo2, Trash2, Volume2, VolumeX, Sliders } from 'lucide-react';

interface KaleidoscopeDrawProps {
  theme: 'boy' | 'girl';
  onClose: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
  id: number;
}

// Enchanted color palettes matching your dark themes
const STARRY_COLORS_BOY = ['#38BDF8', '#7DD3FC', '#78716C', '#E2E8F0', '#0EA5E9', '#34D399'];
const STARRY_COLORS_GIRL = ['#E85D8D', '#F472B6', '#FBCFE8', '#F9A8D4', '#C084FC', '#FCD34D'];

export default function KaleidoscopeDraw({ theme, onClose }: KaleidoscopeDrawProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number | null>(null);

  // States
  const [brushSize, setBrushSize] = useState(3);
  const [starSpeed, setStarSpeed] = useState(1.5); // Particle drifting speed
  const [brushColor, setBrushColor] = useState(theme === 'boy' ? STARRY_COLORS_BOY[0] : STARRY_COLORS_GIRL[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const brushSizeRef = useRef(brushSize);
  const starSpeedRef = useRef(starSpeed);

  // Keep refs synchronized to prevent stale closures inside animation loops
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { starSpeedRef.current = starSpeed; }, [starSpeed]);

  const presetColors = theme === 'boy' ? STARRY_COLORS_BOY : STARRY_COLORS_GIRL;

  // Initialize Audio Object safely
  useEffect(() => {
    //use one background music
    audioRef.current = new Audio('/sonican-background-music-new-age-nature-465069.mp3');
    audioRef.current.loop = true;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle Audio Play/Pause
  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.play().catch(err => console.log("Audio play blocked by browser:", err));
    } else {
      audioRef.current.pause();
    }
    setIsMuted(!isMuted);
  };

  // Canvas resize and main loop initializer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement!;
      canvas.width = Math.floor(parent.clientWidth);
      canvas.height = Math.floor(parent.clientHeight);
    };

    resize();
    window.addEventListener('resize', resize);

    // Core Particle Animation Loop (Renders Floating Stars & Fireflies)
    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(p => {
        // Move particles upwards mimicking rising magical embers/fireflies
        p.x += p.vx * starSpeedRef.current;
        p.y += p.vy * starSpeedRef.current;
        p.alpha -= 0.0015; // Slow fading out effect

        if (p.alpha <= 0) return false;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

        // Dynamic Glowing Effect using shadowBlur
        ctx.shadowBlur = p.size * 4;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();

        return true;
      });

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    animationRef.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    setHistoryStack(prev => [...prev.slice(-20), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || historyStack.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    const prev = historyStack[historyStack.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistoryStack(h => h.slice(0, -1));
  }, [historyStack]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveState();
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesRef.current = [];
  }, [saveState]);

  // Generate magical drifting stardust particles on stroke path
  const spawnMagicStars = useCallback((x: number, y: number) => {
    const count = Math.floor(Math.random() * 3) + 2; // Spawns 2-4 fireflies per move event
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -Math.random() * 1.5 - 0.4, // Always drift upwards gently
        alpha: 1.0,
        size: Math.random() * brushSizeRef.current + 1.5,
        color: brushColor,
        id: Date.now() + Math.random(),
      });
    }
  }, [brushColor]);

  // Main drawing engine
  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSizeRef.current;
    ctx.strokeStyle = brushColor;

    // Glowing line strokes mimicking neon constellations
    ctx.shadowColor = brushColor;
    ctx.shadowBlur = brushSizeRef.current * 3;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset for performance efficiency
  }, [brushColor]);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    saveState();
    const point = getCanvasPoint(e);
    lastPoint.current = point;
    isDrawingRef.current = true;
    spawnMagicStars(point.x, point.y);
  }, [getCanvasPoint, saveState, spawnMagicStars]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !lastPoint.current) return;
    const point = getCanvasPoint(e);

    drawLine(lastPoint.current, point);
    spawnMagicStars(point.x, point.y);
    lastPoint.current = point;
  }, [getCanvasPoint, drawLine, spawnMagicStars]);

  const handleEnd = useCallback(() => {
    isDrawingRef.current = false;
    lastPoint.current = null;
  }, []);

  return (
    <div className={`starry-fullscreen ${theme}-theme`}>
      {/* Header */}
      <div className="starry-header">
        <div className="starry-title-group">
          <button className="starry-back-btn" onClick={onClose}>
            <ArrowLeft size={18} />
          </button>
          <Moon size={20} className="starry-icon animated-float" style={{ color: '#FCD34D' }} />
          <h3 className="starry-title">Stardust Doodle</h3>
          <span className="starry-subtitle">A quiet space for your mind</span>
        </div>

        {/* Audio Toggle Controller */}
        <button
          className={`starry-audio-btn ${!isMuted ? 'active-playing' : ''}`}
          onClick={toggleAudio}
          title={isMuted ? "Play Nature Ambience" : "Mute Sound"}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="pulse-icon" />}
          <span className="audio-label-text">Music</span>
        </button>

        <button className="starry-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Interactive Main Canvas Area */}
      <div className="starry-canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="starry-canvas"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>

      {/* Floating Control Dashboard */}
      <div className="starry-controls-dock">
        {/* Fireflies Speed Controller */}
        <div className="dock-control-group">
          <label className="dock-label"><Sliders size={12} /> Drift</label>
          <input
            type="range"
            min="0.2"
            max="4"
            step="0.2"
            value={starSpeed}
            onChange={e => setStarSpeed(parseFloat(e.target.value))}
            className="dock-slider input-accented"
          />
        </div>

        {/* Constellation Line Width Slider */}
        <div className="dock-control-group">
          <label className="dock-label">Glow Brush</label>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={brushSize}
            onChange={e => setBrushSize(parseInt(e.target.value, 10))}
            className="dock-slider input-accented"
          />
        </div>

        {/* Color Palette Popover Container */}
        <div className="dock-control-group color-popover-container">
          <button
            className="palette-toggle-trigger"
            style={{ backgroundColor: brushColor }}
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <Palette size={14} style={{ color: '#fff' }} />
          </button>

          {showColorPicker && (
            <div className="palette-grid-popover">
              <div className="palette-swatch-grid">
                {presetColors.map(c => (
                  <button
                    key={c}
                    className={`palette-swatch-item ${brushColor === c ? 'item-active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => { setBrushColor(c); setShowColorPicker(false); }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={brushColor}
                onChange={e => setBrushColor(e.target.value)}
                className="native-color-picker"
              />
            </div>
          )}
        </div>

        {/* Utility Actions */}
        <div className="dock-control-group actions-dock-divider">
          <button
            className="dock-action-btn action-undo"
            onClick={undo}
            disabled={historyStack.length === 0}
            title="Undo Last Stroke"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="dock-action-btn action-clear"
            onClick={clearCanvas}
            title="Clear Night Sky"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Floating Aesthetic Hint */}
      <div className="starry-bottom-hint">
        - Move your finger gently across the sky to create glowing constellations -
      </div>
    </div>
  );
}