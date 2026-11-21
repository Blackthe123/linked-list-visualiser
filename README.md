# COMP1511 Linked List Visualiser

An interactive, step-by-step visualiser for singly linked lists in C, built to help COMP1511 students understand how pointer manipulation, memory allocation, traversal and recursion actually work at a low level.

**Live demo:** https://blackthe123.github.io/linked-list-visualiser/

---

## Features

### Whiteboard Canvas
The area where the nodes live is an infinite whiteboard you can move around, zoom and draw on while you explain.

| Tool | What it does | Shortcut |
|---|---|---|
| **Move** | Drag a node to reposition it, or drag empty space to pan | `V` |
| **Pen** | Draw in red, green or yellow | `P`, or `1` / `2` / `3` to pick a colour |
| **Erase** | Click to choose a mode from the dropdown: **Whole stroke** removes any line you touch, **Partial** rubs out only what's under the eraser | `E` |
| **Laser** | A red pointer that leaves a short fading trail | `L` |
| **Zoom** | Scroll wheel or trackpad pinch zooms around the cursor. The `−` / `+` buttons zoom around the centre, and clicking the percentage resets to 100% | `-` / `+` |
| **Re-centre** | Brings all nodes and drawings back into view | `R` |
| **Clear ink** | Removes every drawing | |

- Hold **`Space`** (or use the middle mouse button) to pan with any tool, without switching back to Move.
- Drawings live on the canvas, not the screen, so they pan and zoom with the nodes.
- Pointer arrows connect each `node->next` to the node it points at and update in real time as you drag. Variable pointers (`head`, `curr`, `prev`, `new_node`, etc.) are drawn from labels along the top.
- **Reorder** (in the controls) snaps the list into a clean left-to-right layout by following the `next` chain from `head`.

### Step-by-Step C Code Execution
Each operation generates a sequence of frames that walk through the actual C code line by line:
- **Step Prev / Step Next**: move one line at a time
- **Auto Play**: advances automatically every second
- **Skip to End**: jump straight to the final state
- **Cancel**: abandon the operation part way through and restore the list to how it was before it started (any nodes you dragged keep their new positions)

The currently executing line is highlighted in the code panel, and the nodes being worked on are highlighted in the canvas, the stack and the heap.

### Iterative and Recursive Modes
A toggle at the top of the controls switches every operation between its iterative and recursive version. The code panel shows the matching C code.

| Operation | Description |
|---|---|
| `insert_at_index(head, value, index)` | Insert a new node at any position (0 = head). The index defaults to the current length of the list, so the quickest insert adds to the end |
| `delete_node(head, value)` | Delete the first node matching a given value |
| `reverse_list(head)` | Reverse the list in place (three pointers iteratively, or `head->next->next = head` recursively) |
| `find_node(head, value)` | Traverse the list searching for a value |
| `free_list(head)` | Free every node and reset `head` to `NULL` |

### Stack and Heap Views
The resizable panel at the bottom right shows memory side by side:
- **Stack**: `main` and every active function call with its own local variables. During recursion you can watch a new frame get pushed for each call on the way down and popped on the way back up, including the value each call returns to its caller. The running call is outlined.
- **Heap**: each node as it exists in simulated heap memory, with its address (e.g. `0x104`), `value` and `next` pointer.

### Code Browser
Five tabs (`insert_at_index`, `delete_node`, `free_list`, `reverse_list`, `find_node`) let you read any function's code at any time, in whichever mode is selected. While an operation is being stepped through, the viewer locks to that function and tracks the active line.

### Resizable Panels
- Drag the **vertical splitter** to resize the controls/code panel against the canvas.
- Drag the **horizontal splitter** above the stack and heap to resize that panel.
- Drag the **splitter between the stack and heap** to give the stack more room during recursion.

---

## Node Structure

```c
struct node {
    int value;
    struct node *next;
};
```

---

## Running Locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173 by default.

## Building

```bash
npm run build
```

Outputs a static site to `dist/`. Deployed automatically to GitHub Pages by the Actions workflow on every push to `main`.

---

## Project Structure

```
src/
  state/
    types.ts          LLNode, Frame, StackFrame types + iterative and recursive C code
    engine.ts         frame generators for every operation in both modes
                      (pure functions, no React); generateFrames() is the entry point
  components/
    WorkArea.tsx      whiteboard canvas: pan/zoom camera, draggable nodes, SVG pointer
                      arrows, pen/eraser/laser tools and toolbar
    StackArea.tsx     call stack view (one frame per active call)
    HeapArea.tsx      heap memory blocks with addresses
    CodeViewer.tsx    C code with active line tracking
  App.tsx             layout, resizers, mode toggle, playback and cancel, operation dispatch
  index.css           design system (dark mode, glassmorphism nodes, CSS variables)
```

### Adding a New Operation

1. Add iterative and recursive `CODE_*` strings in `src/state/types.ts` and register them in `CODE` and `FN_NAMES`
2. Write iterative and recursive frame generators in `src/state/engine.ts` and add them to `generateFrames`
3. Wire up a button and optional form in `App.tsx` (call `startOp`)
4. Add a tab in `CodeViewer.tsx`

---

## Design Notes

- **Memory addresses are simulated**: sequential hex values like `0x104`, `0x108`, etc. Real addresses are non-deterministic and distract from the concept.
- **Uninitialised memory**: when `malloc` is called, the new node shows `?` for both `value` and `next` until those fields are explicitly assigned, mirroring real C behaviour.
- **No external libraries**: arrows and drawings are plain SVG, dragging and drawing use native Pointer Events, and layout uses CSS Flexbox. React + TypeScript + Vite only.
