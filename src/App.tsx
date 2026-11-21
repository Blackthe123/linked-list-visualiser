import React, { useState, useEffect, useRef } from 'react';
import { WorkArea } from './components/WorkArea';
import { HeapArea } from './components/HeapArea';
import { CodeViewer } from './components/CodeViewer';
import { StackArea } from './components/StackArea';
import type { LLNode, Variables, Frame, OpType, Mode } from './state/types';
import { CODE } from './state/types';
import { generateFrames } from './state/engine';
import type { OpArgs } from './state/engine';

export default function App() {
  const [nodes, setNodes] = useState<LLNode[]>([]);
  const [variables, setVariables] = useState<Variables>({ head: null });
  const [mode, setMode] = useState<Mode>('iterative');
  // List state from before the current operation started, so it can be cancelled
  const [baseState, setBaseState] = useState<{ nodes: LLNode[]; head: string | null } | null>(null);
  
  const [frames, setFrames] = useState<Frame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<number | null>(null);

  // Forms State
  const [activeForm, setActiveForm] = useState<'insert' | 'delete' | 'find' | null>(null);
  const [insertValue, setInsertValue] = useState(10);
  const [insertIndex, setInsertIndex] = useState(0);
  const [deleteValue, setDeleteValue] = useState(10);
  const [findValue, setFindValue] = useState(10);

  // Layout and View State
  const [leftPanelWidth, setLeftPanelWidth] = useState(35);
  const [heapAreaHeight, setHeapAreaHeight] = useState(30);
  const [activeSnippetType, setActiveSnippetType] = useState<OpType>('insert');

  // Sync state with current frame
  const currentFrame: Frame = frames[frameIndex] || {
    nodes,
    variables,
    lineIndex: -1,
    explanation: 'Ready.',
    codeSnippet: CODE[mode][activeSnippetType],
    op: activeSnippetType,
    stack: [{ id: 0, fn: 'main', locals: { head: variables.head } }],
    listHead: variables.head,
  };

  // The list as it stands right now (end of the last operation, or the idle state)
  const getListState = () => {
    if (frames.length > 0) {
      const last = frames[frames.length - 1];
      return { nodes: last.nodes, head: last.listHead };
    }
    return { nodes, head: variables.head };
  };

  const listLength = () => {
    const { nodes: ns, head } = getListState();
    let count = 0;
    let curr = head;
    const seen = new Set<string>();
    while (curr && !seen.has(curr)) {
      seen.add(curr);
      const n = ns.find(x => x.address === curr);
      if (!n) break;
      count++;
      curr = n.next === '?' ? null : n.next;
    }
    return count;
  };

  const handleNodeMove = (id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
    if (frames.length > 0) {
      setFrames(prevFrames => prevFrames.map(f => ({
        ...f,
        nodes: f.nodes.map(n => n.id === id ? { ...n, x, y } : n)
      })));
    }
  };

  const startOp = (op: OpType, args: OpArgs = {}) => {
    const { nodes: baseNodes, head } = getListState();
    const newFrames = generateFrames(mode, op, baseNodes, head, args);
    setBaseState({ nodes: baseNodes, head });
    setFrames(newFrames);
    setFrameIndex(0);
    setIsPlaying(false);
    setActiveForm(null);
    setActiveSnippetType(op);
  };

  const startInsert = () => startOp('insert', { value: insertValue, index: insertIndex });
  const startDelete = () => startOp('delete', { value: deleteValue });
  const startFree = () => startOp('free');
  const startReverse = () => startOp('reverse');
  const startFind = () => startOp('find', { value: findValue });

  const openInsertForm = () => {
    if (activeForm === 'insert') {
      setActiveForm(null);
      return;
    }
    // Default to inserting at the end of the list
    setInsertIndex(listLength());
    setActiveForm('insert');
  };

  // Abandon the running operation and put the list back how it was before it started.
  // Keeps any node positions you dragged while stepping through.
  const cancelOp = () => {
    if (!baseState) return;
    const moved = new Map(currentFrame.nodes.map(n => [n.id, n]));
    const restored = baseState.nodes.map(n => {
      const m = moved.get(n.id);
      return m ? { ...n, x: m.x, y: m.y } : { ...n };
    });
    setNodes(restored);
    setVariables({ head: baseState.head });
    setFrames([]);
    setFrameIndex(0);
    setIsPlaying(false);
    setBaseState(null);
  };

  const reorderNodes = () => {
    const { nodes: activeNodes, head: headAddress } = getListState();

    const newNodes = activeNodes.map(n => ({ ...n }));
    let curr = headAddress;
    let index = 0;
    while (curr) {
      const nodeObj = newNodes.find(n => n.address === curr);
      if (nodeObj) {
        nodeObj.x = 50 + (index * 130);
        nodeObj.y = 100;
        curr = nodeObj.next === '?' ? null : nodeObj.next;
        index++;
      } else {
        break;
      }
    }
    
    if (frames.length > 0) {
      setFrames(prevFrames => prevFrames.map((f, i) => i === frames.length - 1 ? { ...f, nodes: newNodes } : f));
    } else {
      setNodes(newNodes);
    }
  };

  const stepNext = () => {
    if (frameIndex < frames.length - 1) {
      setFrameIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const skipToEnd = () => {
    if (frames.length > 0) {
      setFrameIndex(frames.length - 1);
      setIsPlaying(false);
    }
  };

  const stepPrev = () => {
    if (frameIndex > 0) {
      setFrameIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      playRef.current = window.setInterval(() => {
        setFrameIndex(prev => {
          if (prev < frames.length - 1) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, 1000);
    } else if (playRef.current) {
      clearInterval(playRef.current);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, frames.length]);

  const highlightedAddresses = React.useMemo(() => {
    if (currentFrame.highlight) return currentFrame.highlight;
    const addresses = new Set<string>();
    if (currentFrame.variables['curr']) addresses.add(currentFrame.variables['curr']);
    if (currentFrame.variables['temp']) addresses.add(currentFrame.variables['temp']);
    if (currentFrame.variables['next_node']) addresses.add(currentFrame.variables['next_node']);
    if (currentFrame.variables['prev']) addresses.add(currentFrame.variables['prev']);
    return Array.from(addresses);
  }, [currentFrame]);

  // Resizer logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const newWidth = (e.clientX / window.innerWidth) * 100;
    if (newWidth > 20 && newWidth < 80) {
      setLeftPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleHeapMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleHeapMouseMove);
    document.addEventListener('mouseup', handleHeapMouseUp);
  };

  const handleHeapMouseMove = (e: MouseEvent) => {
    const newHeight = 100 - (e.clientY / window.innerHeight) * 100;
    if (newHeight > 10 && newHeight < 80) {
      setHeapAreaHeight(newHeight);
    }
  };

  const handleHeapMouseUp = () => {
    document.removeEventListener('mousemove', handleHeapMouseMove);
    document.removeEventListener('mouseup', handleHeapMouseUp);
  };
  const isOperating = frames.length > 0 && frameIndex < frames.length - 1;

  const handleSnippetChange = (type: OpType) => {
    // Only allow switching when not mid-execution
    if (!isOperating) {
      setActiveSnippetType(type);
    }
  };

  // While an operation is running step-by-step, lock the viewer to that function's code.
  // Any other time (idle, before first confirm, or after last frame) allow free browsing.
  const displayedSnippet = isOperating ? currentFrame.codeSnippet : CODE[mode][activeSnippetType];
  const displayedLineIndex = isOperating ? currentFrame.lineIndex : -1;
  const displayedActiveSnippetType = isOperating ? currentFrame.op : activeSnippetType;

  return (
    <div className="app-container">
      <div className="left-panel" style={{ width: `${leftPanelWidth}%` }}>
        <div className="controls">
          <h2>Controls</h2>
          <div className="mode-toggle" title="Switch between iterative and recursive versions of every function">
            <button className={mode === 'iterative' ? 'active' : ''} disabled={isOperating} onClick={() => setMode('iterative')}>Iterative</button>
            <button className={mode === 'recursive' ? 'active' : ''} disabled={isOperating} onClick={() => setMode('recursive')}>Recursive</button>
          </div>
          <div className="controls-row">
            <button disabled={isOperating} onClick={openInsertForm}>Insert Node</button>
            <button disabled={isOperating} onClick={() => setActiveForm(activeForm === 'delete' ? null : 'delete')}>Delete Node</button>
            <button disabled={isOperating} onClick={() => setActiveForm(activeForm === 'find' ? null : 'find')}>Find Node</button>
          </div>
          <div className="controls-row">
            <button disabled={isOperating} onClick={startReverse} style={{ background: isOperating ? 'var(--node-bg)' : 'var(--accent)', borderColor: isOperating ? 'var(--node-bg)' : 'var(--accent)' }}>Reverse List</button>
            <button disabled={isOperating} onClick={startFree} style={{ background: isOperating ? 'var(--node-bg)' : 'var(--node-highlight)', borderColor: isOperating ? 'var(--node-bg)' : 'var(--node-highlight)' }}>Reset (Free)</button>
            <button disabled={isOperating} onClick={reorderNodes}>Reorder</button>
          </div>
          
          {activeForm === 'insert' && !isOperating && (
            <div className="controls-forms">
              <div className="control-title">Insert at Index</div>
              <div className="control-group">
                <label>Value</label>
                <input type="number" value={insertValue} onChange={e => setInsertValue(Number(e.target.value))} />
              </div>
              <div className="control-group">
                <label>Index (list has {listLength()} node{listLength() === 1 ? '' : 's'})</label>
                <input type="number" value={insertIndex} onChange={e => setInsertIndex(Number(e.target.value))} />
              </div>
              <button onClick={startInsert} style={{ background: 'var(--accent)', marginTop: '0.5rem' }}>Confirm Insert</button>
            </div>
          )}

          {activeForm === 'delete' && !isOperating && (
            <div className="controls-forms">
              <div className="control-title">Delete by Value</div>
              <div className="control-group">
                <label>Value</label>
                <input type="number" value={deleteValue} onChange={e => setDeleteValue(Number(e.target.value))} />
              </div>
              <button onClick={startDelete} style={{ background: 'var(--node-highlight)', borderColor: 'var(--node-highlight)', marginTop: '0.5rem' }}>Confirm Delete</button>
            </div>
          )}

          {activeForm === 'find' && !isOperating && (
            <div className="controls-forms">
              <div className="control-title">Find Node</div>
              <div className="control-group">
                <label>Value</label>
                <input type="number" value={findValue} onChange={e => setFindValue(Number(e.target.value))} />
              </div>
              <button onClick={startFind} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', marginTop: '0.5rem' }}>Confirm Find</button>
            </div>
          )}
          
          <hr style={{ borderColor: 'var(--node-border)' }} />
          
          <div className="controls-row">
            <button onClick={stepPrev} disabled={frameIndex === 0 || frames.length === 0}>Step Prev</button>
            <button onClick={stepNext} disabled={frameIndex >= frames.length - 1 || frames.length === 0}>Step Next</button>
            <button onClick={skipToEnd} disabled={frameIndex >= frames.length - 1 || frames.length === 0}>Skip to End</button>
            <button onClick={() => setIsPlaying(!isPlaying)} disabled={frameIndex >= frames.length - 1 || frames.length === 0}>
              {isPlaying ? 'Pause' : 'Auto Play'}
            </button>
            {isOperating && (
              <button className="cancel-btn" onClick={cancelOp} title="Stop this operation and restore the list to how it was before it started">
                Cancel
              </button>
            )}
          </div>
          <div style={{ color: 'var(--accent)', marginTop: '0.5rem', minHeight: '3rem' }}>
            {currentFrame.explanation}
          </div>
        </div>
        
        <div className="vars-panel">
          <h3>Variables</h3>
          {Object.entries(currentFrame.variables).map(([k, v]) => (
            <div className="var-item" key={k}>
              <span>{k}</span>
              <span style={{ color: 'var(--accent)' }}>{v !== null ? String(v) : 'NULL'}</span>
            </div>
          ))}
        </div>

        <CodeViewer 
          codeSnippet={displayedSnippet}
          currentLine={displayedLineIndex}
          activeSnippetType={displayedActiveSnippetType}
          onSnippetChange={handleSnippetChange}
        />
      </div>

      <div className="resizer" onMouseDown={handleMouseDown} />

      <div className="right-panel">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <WorkArea 
            nodes={currentFrame.nodes}
            variables={currentFrame.variables}
            highlightedAddresses={highlightedAddresses}
            onNodeMove={handleNodeMove}
          />
        </div>
        <div className="heap-resizer" onMouseDown={handleHeapMouseDown} />
        <div style={{ height: `${heapAreaHeight}%`, display: 'flex', flexDirection: 'column' }}>
          <div className="memory-row">
            <StackArea stack={currentFrame.stack} highlightedAddresses={highlightedAddresses} />
            <HeapArea
              nodes={currentFrame.nodes}
              variables={currentFrame.variables}
              highlightedAddresses={highlightedAddresses}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
