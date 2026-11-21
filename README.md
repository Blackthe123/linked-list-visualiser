# COMP1511 Linked List Visualiser

An interactive, step-by-step visualiser for singly linked lists in C built to help COMP1511 students understand how pointer manipulation, memory allocation, and traversal actually work at a low level.

**Live demo:** https://blackthe123.github.io/COMP1511-visualiser/

---

## Features

### Interactive Work Area (Whiteboard)
- **Infinite canvas** — drag empty space to pan (or hold `Space` / use the middle mouse button with any tool), scroll to zoom around the cursor, and press **Fit** (`F`) to frame everything.
- **Drawing tools** — pen in red, green or yellow (`P`, or `1` / `2` / `3`), eraser that removes whole strokes (`E`), and a fading laser pointer (`L`). **Move** (`V`) goes back to dragging nodes. Drawings stay put in canvas space, so they zoom and pan with the nodes.
- **Draggable nodes** — grab any node and reposition it freely on the canvas. All pointer arrows update in real time as you drag.
- **Live pointer arrows** — SVG arrows connect `node->next` to its target's memory address header. Tail nodes show an explicit `NULL` block.
- **Reorder button** — instantly snaps the list into a clean left-to-right linear layout, following the `next` chain from `head`.

### Step-by-Step C Code Execution
Each operation generates a sequence of frames that walk through the actual C code line by line:
- **Step Prev / Step Next** — move one line at a time
- **Auto Play** — automatically advances every second
- **Skip to End** — jump straight to the final state
- **Cancel** — abandon the operation part way through and restore the list to how it was before it started
- The **currently executing line is highlighted** in the code panel, and all active pointer variables (`curr`, `prev`, `temp`, `new_node`, etc.) are highlighted in **both** the work area and the heap.

### Supported Operations
| Operation | Description |
|---|---|
| `insert_at_index(head, value, index)` | Insert a new node at any position (0 = head) |
| `delete_node(head, value)` | Delete the first node matching a given value |
| `reverse_list(head)` | Reverse the list in place (3-pointer technique) |
| `find_node(head, value)` | Traverse the list searching for a value |
| `free_list(head)` | Free every node one by one and reset `head` to `NULL` |

Insert defaults its index to the current length of the list, so the quickest insert adds to the end.

### Iterative and Recursive Modes
A toggle at the top of the controls switches every operation between its iterative and recursive version. The code panel shows the matching C code, and each recursive call gets its own frame in the stack view.

### Stack Memory View
Next to the heap, the stack panel shows `main` and every active function call with its local variables. During recursion you can watch frames get pushed on the way down and popped on the way back up, including the value each call returns to its caller.

### Heap Memory View
A resizable panel at the bottom right shows each node as it exists in simulated heap memory — with its **memory address** (e.g. `0x104`), **`value`**, and **`next` pointer**. Nodes currently being operated on are highlighted to match the work area.

### Code Browser
Five tabs (`insert_at_index`, `delete_node`, `free_list`, `reverse_list`, `find_node`) let you read any function's code freely at any time. While an operation is actively being stepped through, the viewer locks to that function and tracks the active line. Once complete, all tabs are browsable again.

### Resizable Panels
- Drag the **vertical splitter** to resize the code/controls panel vs. the canvas.
- Drag the **horizontal splitter** above the heap to resize the heap panel height.

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

Outputs a static site to `dist/`. Deployed automatically to GitHub Pages via the Actions workflow on every push to `main`.

---

## Project Structure

```
src/
  state/
    types.ts          — LLNode, Frame, Variables types + all C code constants
    engine.ts         — frame generators for each operation (insert, delete,
                        reverse, find, free) — pure functions, no React
  components/
    WorkArea.tsx      — draggable node canvas with live SVG pointer arrows
    HeapArea.tsx      — static heap memory block view with addresses
    StackArea.tsx     — call stack view (one frame per active call)
    CodeViewer.tsx    — syntax-highlighted C code with active line tracking
  App.tsx             — layout, resizers, state machine, operation dispatch
  index.css           — design system (dark mode, glassmorphism nodes,
                        animations, CSS variables)
```

### Adding a New Operation

1. Add a `CODE_*` constant string in `src/state/types.ts`
2. Write iterative and recursive frame generators in `src/state/engine.ts` and add them to `generateFrames`
3. Wire up a button + optional form in `App.tsx` (call `startOp`)
4. Add a tab in `CodeViewer.tsx`

---

## Design Notes

- **Memory addresses are simulated** — sequential hex values like `0x104`, `0x108`, etc. Real addresses are non-deterministic and distract from the concept.
- **Uninitialized memory** — when `malloc` is called, the new node shows `?` for both `value` and `next` until those fields are explicitly assigned, mirroring real C behaviour.
- **No external libraries** — pointer arrows are plain SVG, dragging uses native Pointer Events, layout uses CSS Flexbox. React + TypeScript + Vite only.
