import React from 'react';
import type { StackFrame } from '../state/types';

interface StackAreaProps {
  stack: StackFrame[];
  highlightedAddresses: string[];
}

const show = (v: unknown) => (v === null || v === undefined ? 'NULL' : String(v));

export const StackArea: React.FC<StackAreaProps> = ({ stack, highlightedAddresses }) => {
  // Draw the most recent call at the top, main at the bottom
  const frames = [...stack].reverse();

  return (
    <div className="stack-area">
      <div className="area-title">Stack</div>
      <div className="stack-frames">
        {frames.map((frame, i) => {
          const isTop = i === 0 && stack.length > 1;
          return (
            <div key={frame.id} className={`stack-frame ${isTop ? 'active' : ''}`}>
              <div className="stack-header">
                <span>{frame.fn}()</span>
                {frame.fn !== 'main' && <span className="stack-depth">#{frame.id}</span>}
              </div>
              {Object.entries(frame.locals).map(([k, v]) => (
                <div className="heap-row" key={k}>
                  <span className="heap-label">{k}:</span>
                  <span className={typeof v === 'string' && highlightedAddresses.includes(v) && isTop ? 'stack-hl' : ''}>
                    {show(v)}
                  </span>
                </div>
              ))}
              {frame.returned && (
                <div className="heap-row stack-returned">
                  <span>returned:</span>
                  <span>{show(frame.returned.value)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
