import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LLNode, Variables } from '../state/types';

interface WorkAreaProps {
  nodes: LLNode[];
  variables: Variables;
  highlightedAddresses: string[];
  onNodeMove: (id: string, x: number, y: number) => void;
}

type Tool = 'select' | 'pen' | 'eraser' | 'laser';
type EraseMode = 'stroke' | 'partial';
type Point = { x: number; y: number };
type Stroke = { id: number; color: string; points: Point[] };
type LaserPoint = Point & { t: number };

const PEN_COLORS = [
  { name: 'Red', value: '#ef4444', key: '1' },
  { name: 'Green', value: '#22c55e', key: '2' },
  { name: 'Yellow', value: '#facc15', key: '3' },
];

const NODE_W = 90;
const NODE_H = 60;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const LASER_FADE_MS = 280;
const ERASER_RADIUS = 12; // screen pixels

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Distance from point p to segment ab
function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Add points along each segment so no gap is wider than `step` (lets the partial eraser cut cleanly)
function densify(points: Point[], step: number): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

function strokeTouches(s: Stroke, p: Point, r: number) {
  if (s.points.length === 1) return Math.hypot(s.points[0].x - p.x, s.points[0].y - p.y) <= r;
  for (let i = 0; i < s.points.length - 1; i++) {
    if (distToSegment(p, s.points[i], s.points[i + 1]) <= r) return true;
  }
  return false;
}

function strokePath(points: Point[]) {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y}`;
  }
  // Smooth the line by curving through midpoints
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export const WorkArea: React.FC<WorkAreaProps> = ({ nodes, variables, highlightedAddresses, onNodeMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera: screen = world * scale + (x, y)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [tool, setToolState] = useState<Tool>('select');
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const strokeIdRef = useRef(1);

  const [laserTrail, setLaserTrail] = useState<LaserPoint[]>([]);
  const [hoverPos, setHoverPos] = useState<Point | null>(null); // screen coords
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [eraseMode, setEraseMode] = useState<EraseMode>('stroke');
  const [eraseMenuOpen, setEraseMenuOpen] = useState(false);
  const setTool = (t: Tool) => {
    setToolState(t);
    if (t !== 'eraser') setEraseMenuOpen(false);
  };

  // Interaction state
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const erasingRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const toScreenLocal = (e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const s = toScreenLocal(e);
    const v = viewRef.current;
    return { x: (s.x - v.x) / v.scale, y: (s.y - v.y) / v.scale };
  };

  // ---- Zoom -------------------------------------------------------------

  const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
    setView(v => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, x: screenX - (screenX - v.x) * k, y: screenY - (screenY - v.y) * k };
    });
  }, []);

  const zoomCenter = useCallback((factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }, [zoomAt]);

  const resetZoom = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.width / 2, rect.height / 2, 1 / viewRef.current.scale);
  };

  const fitToContent = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xs: number[] = [];
    const ys: number[] = [];
    nodes.forEach(n => {
      xs.push(n.x, n.x + NODE_W);
      ys.push(n.y, n.y + NODE_H);
    });
    strokes.forEach(s => s.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
    if (xs.length === 0) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    ys.push(0); // keep the variable labels along the top in view
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 60;
    const scale = clamp(
      Math.min(rect.width / (maxX - minX + pad * 2), rect.height / (maxY - minY + pad * 2), 1.5),
      MIN_SCALE,
      MAX_SCALE
    );
    setView({
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
    });
  }, [nodes, strokes]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas, so boost it
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-delta * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---- Keyboard shortcuts ----------------------------------------------

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'p') setTool('pen');
      else if (k === 'e') setTool('eraser');
      else if (k === 'l') setTool('laser');
      else if (k === 'r') fitToContent();
      else if (k === '=' || k === '+') zoomCenter(1.2);
      else if (k === '-') zoomCenter(1 / 1.2);
      else {
        const c = PEN_COLORS.find(c => c.key === k);
        if (c) {
          setPenColor(c.value);
          setTool('pen');
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fitToContent, zoomCenter]);

  // ---- Laser fade loop: re-render every frame while there is a trail ----

  const hasTrail = laserTrail.length > 0;
  useEffect(() => {
    if (!hasTrail) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      setLaserTrail(trail => trail.filter(p => now - p.t < LASER_FADE_MS));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasTrail]);

  // ---- Erasing ----------------------------------------------------------

  const eraseAt = (world: Point) => {
    const r = ERASER_RADIUS / viewRef.current.scale;
    setStrokes(prev => {
      const out: Stroke[] = [];
      for (const s of prev) {
        if (!strokeTouches(s, world, r)) {
          out.push(s);
          continue;
        }
        if (eraseMode === 'stroke') continue; // whole stroke goes

        // Partial: cut out the part under the eraser and keep what's left as separate strokes
        let piece: Point[] = [];
        const flush = () => {
          if (piece.length >= 2) out.push({ id: strokeIdRef.current++, color: s.color, points: piece });
          piece = [];
        };
        for (const p of densify(s.points, r / 3)) {
          if (Math.hypot(p.x - world.x, p.y - world.y) <= r) flush();
          else piece.push(p);
        }
        flush();
      }
      return out;
    });
  };

  // ---- Pointer handling -------------------------------------------------

  const handleNodePointerDown = (e: React.PointerEvent, node: LLNode) => {
    // Only grab nodes with the Move tool; otherwise let the canvas handle it
    if (tool !== 'select' || spaceHeld || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e);
    dragRef.current = { id: node.id, dx: w.x - node.x, dy: w.y - node.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Stop the browser from starting a text selection across the page while drawing/panning
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    setEraseMenuOpen(false);
    const target = e.currentTarget as HTMLElement;
    const wantsPan = e.button === 1 || spaceHeld || (tool === 'select' && e.button === 0);
    if (wantsPan) {
      e.preventDefault();
      panRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      setIsPanning(true);
      target.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'pen') {
      target.setPointerCapture(e.pointerId);
      setCurrentStroke({ id: strokeIdRef.current++, color: penColor, points: [toWorld(e)] });
    } else if (tool === 'eraser') {
      target.setPointerCapture(e.pointerId);
      erasingRef.current = true;
      eraseAt(toWorld(e));
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const screen = toScreenLocal(e);
    setHoverPos(screen);

    if (dragRef.current) {
      const w = toWorld(e);
      onNodeMove(dragRef.current.id, w.x - dragRef.current.dx, w.y - dragRef.current.dy);
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      setView(v => ({ ...v, x: p.viewX + (e.clientX - p.startX), y: p.viewY + (e.clientY - p.startY) }));
      return;
    }
    if (currentStroke) {
      const w = toWorld(e);
      const last = currentStroke.points[currentStroke.points.length - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) * view.scale >= 1.5) {
        setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, w] });
      }
      return;
    }
    if (erasingRef.current) {
      eraseAt(toWorld(e));
      return;
    }
    if (tool === 'laser' && !spaceHeld) {
      setLaserTrail(trail => [...trail, { ...screen, t: performance.now() }]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (panRef.current) {
      panRef.current = null;
      setIsPanning(false);
    }
    if (currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
    erasingRef.current = false;
  };

  // ---- Rendering: arrows (world coords) ---------------------------------

  const renderArrows = () => {
    return nodes.map(node => {
      if (!node.next || node.next === '?') return null;

      const targetNode = nodes.find(n => n.address === node.next);
      if (!targetNode) return null;

      const isHighlighted = highlightedAddresses.includes(node.address);
      const startX = node.x + 67.5; // centre of the 'next' box
      const startY = node.y + NODE_H;
      const endX = targetNode.x + NODE_W / 2;
      const endY = targetNode.y - 2;
      const pathD = `M ${startX} ${startY} C ${startX} ${startY + 40}, ${endX} ${endY - 40}, ${endX} ${endY}`;

      return (
        <path
          key={`${node.address}-next`}
          className={`arrow-path ${isHighlighted ? 'highlighted' : ''}`}
          d={pathD}
          markerEnd={`url(#arrowhead${isHighlighted ? '-highlighted' : ''})`}
        />
      );
    });
  };

  const renderVariables = () => {
    // Only pointer variables that currently point at a node get an arrow (skip ints like value/index)
    const pointers = Object.entries(variables).filter(
      ([, address]) => typeof address === 'string' && nodes.some(n => n.address === address)
    );
    return pointers.map(([varName, address], index) => {
      const targetNode = nodes.find(n => n.address === address)!;
      const startX = 50 + index * 100;
      const startY = 30;
      const endX = targetNode.x + 60;
      const endY = targetNode.y;
      const pathD = `M ${startX} ${startY} Q ${startX} ${endY - 50}, ${endX} ${endY}`;
      return (
        <React.Fragment key={`var-${varName}`}>
          <text x={startX} y={startY - 10} fill="var(--accent)" fontFamily="var(--font-mono)" fontSize="12px" textAnchor="middle">
            {varName}
          </text>
          <path className="arrow-path" stroke="var(--accent)" d={pathD} markerEnd="url(#arrowhead-var)" />
        </React.Fragment>
      );
    });
  };

  // ---- Rendering: laser (screen coords) ---------------------------------

  const renderLaser = () => {
    const now = performance.now();
    const segs = [];
    for (let i = 1; i < laserTrail.length; i++) {
      const a = laserTrail[i - 1];
      const b = laserTrail[i];
      const life = 1 - (now - b.t) / LASER_FADE_MS;
      if (life <= 0) continue;
      segs.push(
        <line
          key={`${b.t}-${i}`}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#ff2d2d"
          strokeWidth={2 + 3 * life}
          strokeLinecap="round"
          opacity={life}
        />
      );
    }
    return segs;
  };

  const cursor =
    isPanning ? 'grabbing'
    : spaceHeld || tool === 'select' ? 'grab'
    : tool === 'pen' ? 'crosshair'
    : 'none';

  const gridSize = 24 * view.scale;

  return (
    <div
      className="work-area"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHoverPos(null)}
      style={{
        cursor,
        backgroundSize: `${gridSize}px ${gridSize}px, 100% 100%`,
        backgroundPosition: `${view.x}px ${view.y}px, 0 0`,
      }}
    >
      {/* Everything inside .world is in world coordinates and moves with the camera */}
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="world-svg">
          <defs>
            {/* userSpaceOnUse keeps every arrowhead the same size regardless of stroke width */}
            <marker id="arrowhead" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto">
              <polygon points="0 0, 14 5, 0 10" fill="var(--text-secondary)" />
            </marker>
            <marker id="arrowhead-highlighted" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto">
              <polygon points="0 0, 14 5, 0 10" fill="var(--node-highlight)" />
            </marker>
            <marker id="arrowhead-var" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto">
              <polygon points="0 0, 14 5, 0 10" fill="var(--accent)" />
            </marker>
          </defs>
          {renderArrows()}
          {renderVariables()}
        </svg>

        {nodes.map(node => (
          <div
            key={node.id}
            className={`node ${highlightedAddresses.includes(node.address) ? 'highlighted' : ''}`}
            style={{
              transform: `translate(${node.x}px, ${node.y}px)`,
              cursor: tool === 'select' && !spaceHeld ? undefined : 'inherit',
            }}
            onPointerDown={(e) => handleNodePointerDown(e, node)}
          >
            <div className="node-header">{node.address}</div>
            <div className="node-body">
              <div className="node-value">{node.value}</div>
              <div className="node-next" style={{ fontSize: '0.7rem' }}>
                {node.next === '?' ? '?' : node.next === null ? 'NULL' : node.next}
              </div>
            </div>
          </div>
        ))}

        {/* Ink sits above the nodes so you can draw over them */}
        <svg className="world-svg ink-layer">
          {[...strokes, ...(currentStroke ? [currentStroke] : [])].map(s => (
            <path
              key={s.id}
              d={strokePath(s.points)}
              stroke={s.color}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>

      {/* Screen-space overlay: laser trail and tool cursors */}
      <svg className="overlay-svg">
        {renderLaser()}
        {hoverPos && tool === 'laser' && !spaceHeld && (
          <>
            <circle cx={hoverPos.x} cy={hoverPos.y} r={9} fill="#ff2d2d" opacity={0.25} />
            <circle cx={hoverPos.x} cy={hoverPos.y} r={4.5} fill="#ff2d2d" />
          </>
        )}
        {hoverPos && tool === 'eraser' && !spaceHeld && (
          <circle cx={hoverPos.x} cy={hoverPos.y} r={ERASER_RADIUS} fill="rgba(255,255,255,0.08)" stroke="var(--text-primary)" strokeWidth={1.5} />
        )}
      </svg>

      {/* Toolbar */}
      <div className="wb-toolbar" onPointerDown={e => e.stopPropagation()}>
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Move nodes / pan (V). Hold Space to pan with any tool">
          Move
        </button>
        <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Pen (P)">
          Pen
        </button>
        {PEN_COLORS.map(c => (
          <button
            key={c.value}
            className={`wb-swatch ${penColor === c.value ? 'active' : ''}`}
            style={{ background: c.value }}
            onClick={() => { setPenColor(c.value); setTool('pen'); }}
            title={`${c.name} pen (${c.key})`}
            aria-label={`${c.name} pen`}
          />
        ))}
        <div className="wb-dropdown">
          <button
            className={tool === 'eraser' ? 'active' : ''}
            onClick={() => {
              setTool('eraser');
              setEraseMenuOpen(open => (tool === 'eraser' ? !open : true));
            }}
            title="Eraser (E). Click to choose whole-stroke or partial"
          >
            Erase{tool === 'eraser' ? (eraseMode === 'partial' ? ': Partial' : ': Stroke') : ''} ▾
          </button>
          {eraseMenuOpen && (
            <div className="wb-menu">
              <button
                className={eraseMode === 'stroke' ? 'selected' : ''}
                onClick={() => { setEraseMode('stroke'); setTool('eraser'); setEraseMenuOpen(false); }}
              >
                <strong>Whole stroke</strong>
                <span>Removes any line you touch</span>
              </button>
              <button
                className={eraseMode === 'partial' ? 'selected' : ''}
                onClick={() => { setEraseMode('partial'); setTool('eraser'); setEraseMenuOpen(false); }}
              >
                <strong>Partial</strong>
                <span>Rubs out only what's under the eraser</span>
              </button>
            </div>
          )}
        </div>
        <button className={tool === 'laser' ? 'active' : ''} onClick={() => setTool('laser')} title="Laser pointer (L)">
          Laser
        </button>
        <div className="wb-sep" />
        <button onClick={() => zoomCenter(1 / 1.2)} title="Zoom out (-)">−</button>
        <button className="wb-zoom" onClick={resetZoom} title="Reset zoom to 100%">
          {Math.round(view.scale * 100)}%
        </button>
        <button onClick={() => zoomCenter(1.2)} title="Zoom in (+)">+</button>
        <button onClick={fitToContent} title="Bring everything back into view (R)">Re-centre</button>
        <div className="wb-sep" />
        <button onClick={() => setStrokes([])} disabled={strokes.length === 0} title="Clear all drawings">
          Clear ink
        </button>
      </div>
    </div>
  );
};
