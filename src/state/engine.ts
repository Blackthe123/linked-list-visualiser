import type { LLNode, Frame, Variables, OpType, Mode, StackFrame } from './types';
import { CODE_INSERT, CODE_DELETE, CODE_FREE, CODE_REVERSE, CODE_FIND, CODE, FN_NAMES } from './types';

type RawFrame = Omit<Frame, 'op' | 'stack' | 'listHead'>;

function cloneNodes(nodes: LLNode[]): LLNode[] {
  return nodes.map(n => ({ ...n }));
}

function cloneVars(vars: Variables): Variables {
  return { ...vars };
}

let addrCounter = 100;
function getNewAddress() {
  addrCounter += 4;
  return `0x${addrCounter.toString(16).toUpperCase()}`;
}

/** malloc: adds an uninitialised node below the existing ones, returns its address */
function allocNode(nodes: LLNode[]): string {
  const address = getNewAddress();
  const spawnY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y)) + 150 : 100;
  nodes.push({
    id: `node-${address}-${Date.now()}`,
    address,
    value: '?',
    next: '?',
    x: 100,
    y: spawnY,
  });
  return address;
}

function iterInsert(
  initialNodes: LLNode[],
  initialHead: string | null,
  value: number,
  index: number
): RawFrame[] {
  const frames: RawFrame[] = [];
  let currentNodes = cloneNodes(initialNodes);
  let vars: Variables = { head: initialHead };

  const pushFrame = (line: number, exp: string) => {
    frames.push({
      nodes: cloneNodes(currentNodes),
      variables: cloneVars(vars),
      lineIndex: line,
      explanation: exp,
      codeSnippet: CODE_INSERT,
    });
  };

  pushFrame(0, `Calling insert_at_index(head, ${value}, ${index})`);

  // struct node *new_node = malloc(...)
  const newAddr = allocNode(currentNodes);
  vars['new_node'] = newAddr;
  pushFrame(1, `Allocated new node at ${newAddr} (memory is uninitialized)`);

  // new_node->value = value;
  const n1 = currentNodes.find(n => n.address === newAddr);
  if (n1) n1.value = value;
  pushFrame(2, `Set new_node->value to ${value}`);

  // new_node->next = NULL;
  const n2 = currentNodes.find(n => n.address === newAddr);
  if (n2) n2.next = null;
  pushFrame(3, `Set new_node->next to NULL`);

  // if (index == 0 || head == NULL)
  pushFrame(5, `Check if we are inserting at head`);
  if (index === 0 || vars.head === null) {
    // new_node->next = head;
    const n = currentNodes.find(n => n.address === newAddr);
    if (n) n.next = vars.head;
    pushFrame(6, `Set new_node->next to head`);

    // return new_node;
    vars.head = newAddr;
    delete vars['new_node'];
    pushFrame(7, `Returned new_node as the new head`);
    return frames;
  }

  // struct node *curr = head;
  vars['curr'] = vars.head;
  pushFrame(10, `Initialize curr to head (${vars.head})`);

  // for (int i = 0; i < index - 1 && curr->next != NULL; i++)
  vars['i'] = 0;
  pushFrame(11, `Start loop to find insertion point`);
  
  while (vars['i'] < index - 1) {
    const currNode = currentNodes.find(n => n.address === vars['curr']);
    if (!currNode || currNode.next === null) break;

    // curr = curr->next;
    vars['curr'] = currNode.next;
    pushFrame(12, `Moved curr forward (i=${vars['i']})`);
    
    vars['i']++;
    pushFrame(11, `Increment i to ${vars['i']}`);
  }

  // new_node->next = curr->next;
  const cNode = currentNodes.find(n => n.address === vars['curr']);
  const nNode = currentNodes.find(n => n.address === newAddr);
  if (nNode && cNode) {
    nNode.next = cNode.next;
    pushFrame(15, `Point new_node->next to curr->next`);

    // curr->next = new_node;
    cNode.next = newAddr;
    pushFrame(16, `Point curr->next to new_node`);
  }

  // return head;
  delete vars['new_node'];
  delete vars['curr'];
  delete vars['i'];
  pushFrame(17, `Return head`);

  return frames;
}

function iterDelete(
  initialNodes: LLNode[],
  initialHead: string | null,
  value: number
): RawFrame[] {
  const frames: RawFrame[] = [];
  let currentNodes = cloneNodes(initialNodes);
  let vars: Variables = { head: initialHead };

  const pushFrame = (line: number, exp: string) => {
    frames.push({
      nodes: cloneNodes(currentNodes),
      variables: cloneVars(vars),
      lineIndex: line,
      explanation: exp,
      codeSnippet: CODE_DELETE,
    });
  };

  pushFrame(0, `Calling delete_node(head, ${value})`);

  // if (head == NULL)
  pushFrame(1, `Check if head is NULL`);
  if (vars.head === null) {
    pushFrame(1, `Head is NULL, returning NULL`);
    return frames;
  }

  const headNode = currentNodes.find(n => n.address === vars.head);
  
  // if (head->value == value)
  pushFrame(3, `Check if head's value matches ${value}`);
  if (headNode && headNode.value === value) {
    // struct node *temp = head;
    vars['temp'] = vars.head;
    pushFrame(4, `temp points to head`);

    // head = head->next;
    vars.head = headNode.next;
    pushFrame(5, `head points to head->next`);

    // free(temp);
    currentNodes = currentNodes.filter(n => n.address !== vars['temp']);
    pushFrame(6, `Freed temp node`);

    // return head;
    delete vars['temp'];
    pushFrame(7, `Return new head`);
    return frames;
  }

  // struct node *curr = head;
  vars['curr'] = vars.head;
  pushFrame(10, `Initialize curr to head`);

  // while (curr->next != NULL && curr->next->value != value)
  pushFrame(11, `Start loop to find node to delete`);
  while (true) {
    const cNode = currentNodes.find(n => n.address === vars['curr']);
    if (!cNode || cNode.next === null) {
      pushFrame(11, `curr->next is NULL, end loop`);
      break;
    }
    const nextNode = currentNodes.find(n => n.address === cNode.next);
    if (nextNode && nextNode.value === value) {
      pushFrame(11, `Found node with value ${value}`);
      break;
    }

    // curr = curr->next;
    vars['curr'] = cNode.next;
    pushFrame(12, `Moved curr forward`);
    pushFrame(11, `Check loop condition`);
  }

  // if (curr->next != NULL)
  pushFrame(15, `Check if node was found (curr->next != NULL)`);
  const cNodeFinal = currentNodes.find(n => n.address === vars['curr']);
  if (cNodeFinal && cNodeFinal.next !== null) {
    // struct node *temp = curr->next;
    vars['temp'] = cNodeFinal.next;
    pushFrame(16, `temp points to node to delete (curr->next)`);

    // curr->next = temp->next;
    const tempNode = currentNodes.find(n => n.address === vars['temp']);
    if (tempNode) {
      cNodeFinal.next = tempNode.next;
      pushFrame(17, `curr->next bypasses temp (curr->next = temp->next)`);
    }

    // free(temp);
    currentNodes = currentNodes.filter(n => n.address !== vars['temp']);
    pushFrame(18, `Freed temp node`);
  }

  // return head;
  delete vars['curr'];
  delete vars['temp'];
  pushFrame(20, `Return head`);

  return frames;
}

function iterFree(
  initialNodes: LLNode[],
  initialHead: string | null
): RawFrame[] {
  const frames: RawFrame[] = [];
  let currentNodes = cloneNodes(initialNodes);
  let vars: Variables = { head: initialHead };

  const pushFrame = (line: number, exp: string) => {
    frames.push({
      nodes: cloneNodes(currentNodes),
      variables: cloneVars(vars),
      lineIndex: line,
      explanation: exp,
      codeSnippet: CODE_FREE,
    });
  };

  pushFrame(0, `Calling free_list(head)`);

  // struct node *curr = head;
  vars['curr'] = vars.head;
  pushFrame(1, `Initialize curr to head`);

  // while (curr != NULL)
  pushFrame(2, `Start loop to free nodes`);
  while (vars['curr'] !== null) {
    const cNode = currentNodes.find(n => n.address === vars['curr']);
    if (!cNode) break;

    // struct node *temp = curr;
    vars['temp'] = vars['curr'];
    pushFrame(3, `temp points to curr`);

    // curr = curr->next;
    vars['curr'] = cNode.next === '?' ? null : cNode.next;
    pushFrame(4, `Moved curr forward`);

    // free(temp);
    currentNodes = currentNodes.filter(n => n.address !== vars['temp']);
    pushFrame(5, `Freed temp node`);
    
    pushFrame(2, `Check loop condition`);
  }

  delete vars['curr'];
  delete vars['temp'];
  vars.head = null;
  pushFrame(7, `Finished freeing list`);

  return frames;
}

function iterReverse(
  initialNodes: LLNode[],
  initialHead: string | null
): RawFrame[] {
  const frames: RawFrame[] = [];
  let currentNodes = cloneNodes(initialNodes);
  let vars: Variables = { head: initialHead };

  const pushFrame = (line: number, exp: string) => {
    frames.push({
      nodes: cloneNodes(currentNodes),
      variables: cloneVars(vars),
      lineIndex: line,
      explanation: exp,
      codeSnippet: CODE_REVERSE,
    });
  };

  pushFrame(0, `Calling reverse_list(head)`);

  vars['prev'] = null;
  pushFrame(1, `Initialize prev to NULL`);

  vars['curr'] = vars.head;
  pushFrame(2, `Initialize curr to head`);

  vars['next_node'] = null;
  pushFrame(3, `Initialize next_node to NULL`);

  pushFrame(5, `Start loop to reverse pointers`);
  while (vars['curr'] !== null) {
    const cNode = currentNodes.find(n => n.address === vars['curr']);
    if (!cNode) break;

    // next_node = curr->next;
    vars['next_node'] = cNode.next === '?' ? null : cNode.next;
    pushFrame(6, `Save next node (next_node = curr->next)`);

    // curr->next = prev;
    cNode.next = vars['prev'];
    pushFrame(7, `Reverse pointer (curr->next = prev)`);

    // prev = curr;
    vars['prev'] = vars['curr'];
    pushFrame(8, `Move prev forward (prev = curr)`);

    // curr = next_node;
    vars['curr'] = vars['next_node'];
    pushFrame(9, `Move curr forward (curr = next_node)`);

    pushFrame(5, `Check loop condition`);
  }

  vars.head = vars['prev'];
  delete vars['curr'];
  delete vars['next_node'];
  delete vars['prev'];
  pushFrame(12, `Return new head (prev)`);

  return frames;
}

function iterFind(
  initialNodes: LLNode[],
  initialHead: string | null,
  value: number
): RawFrame[] {
  const frames: RawFrame[] = [];
  let currentNodes = cloneNodes(initialNodes);
  let vars: Variables = { head: initialHead };

  const pushFrame = (line: number, exp: string) => {
    frames.push({
      nodes: cloneNodes(currentNodes),
      variables: cloneVars(vars),
      lineIndex: line,
      explanation: exp,
      codeSnippet: CODE_FIND,
    });
  };

  pushFrame(0, `Calling find_node(head, ${value})`);

  vars['curr'] = vars.head;
  pushFrame(1, `Initialize curr to head`);

  pushFrame(3, `Start loop to find node`);
  while (vars['curr'] !== null) {
    const cNode = currentNodes.find(n => n.address === vars['curr']);
    if (!cNode) break;

    pushFrame(4, `Check if curr->value == ${value}`);
    if (cNode.value === value) {
      delete vars['curr'];
      pushFrame(5, `Found node! Returning curr`);
      return frames;
    }

    vars['curr'] = cNode.next === '?' ? null : cNode.next;
    pushFrame(7, `Moved curr forward`);
    pushFrame(3, `Check loop condition`);
  }

  delete vars['curr'];
  pushFrame(10, `Node not found, returning NULL`);

  return frames;
}

// ---------------------------------------------------------------------------
// Iterative: wrap raw frames with a simple two-level call stack
// ---------------------------------------------------------------------------

function withStack(raw: RawFrame[], op: OpType, initialHead: string | null): Frame[] {
  return raw.map((f, i) => {
    const isLast = i === raw.length - 1;
    const mainHead = isLast ? f.variables.head : initialHead;
    const stack: StackFrame[] = [{ id: 0, fn: 'main', locals: { head: mainHead } }];
    if (!isLast) stack.push({ id: 1, fn: FN_NAMES[op], locals: { ...f.variables } });
    return { ...f, op, stack, listHead: mainHead };
  });
}

// ---------------------------------------------------------------------------
// Recursive versions
// ---------------------------------------------------------------------------

const fmt = (addr: string | null | undefined) => (addr == null ? 'NULL' : addr);

function makeRecursiveRunner(op: OpType, initialNodes: LLNode[], initialHead: string | null) {
  const frames: Frame[] = [];
  let nodes = cloneNodes(initialNodes);
  const stack: StackFrame[] = [{ id: 0, fn: 'main', locals: { head: initialHead } }];
  let nextId = 1;

  const top = () => stack[stack.length - 1];

  const snap = (line: number, explanation: string) => {
    const t = top();
    frames.push({
      nodes: cloneNodes(nodes),
      variables: { ...t.locals } as Variables,
      lineIndex: line,
      explanation,
      codeSnippet: CODE.recursive[op],
      op,
      stack: stack.map(f => ({
        ...f,
        locals: { ...f.locals },
        returned: f.returned ? { ...f.returned } : undefined,
      })),
      listHead: stack[0].locals.head,
      highlight: t.fn !== 'main' && t.locals.head ? [t.locals.head] : [],
    });
  };

  return {
    frames,
    snap,
    top,
    node: (addr: string | null) => (addr ? nodes.find(n => n.address === addr) : undefined),
    call: (locals: Record<string, any>) => {
      stack.push({ id: nextId++, fn: FN_NAMES[op], locals });
    },
    ret: () => {
      stack.pop();
    },
    /** Show the caller receiving a value from the call it just made */
    receive: (value: string | null) => {
      top().returned = { value };
    },
    clearReceived: () => {
      delete top().returned;
    },
    malloc: () => allocNode(nodes),
    free: (addr: string) => {
      nodes = nodes.filter(n => n.address !== addr);
    },
    setMainHead: (h: string | null) => {
      stack[0].locals.head = h;
    },
  };
}

function recInsert(initialNodes: LLNode[], initialHead: string | null, value: number, index: number): Frame[] {
  const r = makeRecursiveRunner('insert', initialNodes, initialHead);

  const go = (head: string | null, index: number): string | null => {
    r.call({ head, value, index });
    r.snap(0, `Called insert_at_index(${fmt(head)}, ${value}, ${index})`);
    r.snap(1, `Check index == 0 || head == NULL (index = ${index}, head = ${fmt(head)})`);
    if (index === 0 || head === null) {
      const addr = r.malloc();
      r.top().locals.new_node = addr;
      r.snap(2, `Base case. Allocated new node at ${addr} (memory is uninitialised)`);
      r.node(addr)!.value = value;
      r.snap(3, `Set new_node->value to ${value}`);
      r.node(addr)!.next = head;
      r.snap(4, `Set new_node->next to head (${fmt(head)})`);
      r.snap(5, `Return new_node (${addr}) to the caller`);
      r.ret();
      return addr;
    }
    r.snap(8, `Recursive case. Call insert_at_index on head->next with index ${index - 1}`);
    const result = go(r.node(head)?.next ?? null, index - 1);
    r.receive(result);
    r.snap(8, `Call returned ${fmt(result)}`);
    const n = r.node(head);
    if (n) n.next = result;
    r.clearReceived();
    r.snap(8, `Set head->next (${head}) to ${fmt(result)}`);
    r.snap(9, `Return head (${head}) to the caller`);
    r.ret();
    return head;
  };

  const newHead = go(initialHead, index);
  r.setMainHead(newHead);
  r.snap(-1, `Back in main: head = ${fmt(newHead)}`);
  return r.frames;
}

function recDelete(initialNodes: LLNode[], initialHead: string | null, value: number): Frame[] {
  const r = makeRecursiveRunner('delete', initialNodes, initialHead);

  const go = (head: string | null): string | null => {
    r.call({ head, value });
    r.snap(0, `Called delete_node(${fmt(head)}, ${value})`);
    r.snap(1, `Check if head is NULL`);
    if (head === null) {
      r.snap(1, `head is NULL, return NULL`);
      r.ret();
      return null;
    }
    const n = r.node(head);
    r.snap(3, `Check if head->value (${n?.value}) == ${value}`);
    if (n && n.value === value) {
      r.top().locals.rest = n.next;
      r.snap(4, `Match. Save rest = head->next (${fmt(n.next)})`);
      r.free(head);
      r.snap(5, `free(head) at ${head}`);
      r.snap(6, `Return rest (${fmt(n.next)}) to the caller`);
      r.ret();
      return n.next;
    }
    r.snap(9, `No match. Call delete_node on head->next`);
    const result = go(n?.next ?? null);
    r.receive(result);
    r.snap(9, `Call returned ${fmt(result)}`);
    const n2 = r.node(head);
    if (n2) n2.next = result;
    r.clearReceived();
    r.snap(9, `Set head->next (${head}) to ${fmt(result)}`);
    r.snap(10, `Return head (${head}) to the caller`);
    r.ret();
    return head;
  };

  const newHead = go(initialHead);
  r.setMainHead(newHead);
  r.snap(-1, `Back in main: head = ${fmt(newHead)}`);
  return r.frames;
}

function recFree(initialNodes: LLNode[], initialHead: string | null): Frame[] {
  const r = makeRecursiveRunner('free', initialNodes, initialHead);

  const go = (head: string | null) => {
    r.call({ head });
    r.snap(0, `Called free_list(${fmt(head)})`);
    r.snap(1, `Check if head is NULL`);
    if (head === null) {
      r.snap(1, `head is NULL, return`);
      r.ret();
      return;
    }
    const next = r.node(head)?.next;
    r.snap(3, `Free the rest of the list first: free_list(head->next)`);
    go(next === '?' || next === undefined ? null : next);
    r.snap(3, `free_list(head->next) returned, everything after ${head} is freed`);
    r.free(head);
    r.snap(4, `free(head) at ${head}`);
    r.ret();
  };

  go(initialHead);
  r.setMainHead(null);
  r.snap(-1, `Back in main: list freed, head set to NULL`);
  return r.frames;
}

function recReverse(initialNodes: LLNode[], initialHead: string | null): Frame[] {
  const r = makeRecursiveRunner('reverse', initialNodes, initialHead);

  const go = (head: string | null): string | null => {
    r.call({ head });
    r.snap(0, `Called reverse_list(${fmt(head)})`);
    const n = r.node(head);
    r.snap(1, `Check head == NULL || head->next == NULL`);
    if (head === null || !n || n.next === null) {
      r.snap(2, `Base case. Return head (${fmt(head)})`);
      r.ret();
      return head;
    }
    r.snap(5, `Reverse the rest of the list: reverse_list(head->next)`);
    const newHead = go(n.next);
    r.receive(newHead);
    r.snap(5, `Call returned ${fmt(newHead)}`);
    r.clearReceived();
    r.top().locals.new_head = newHead;
    r.snap(5, `new_head = ${fmt(newHead)}`);
    const nextNode = r.node(n.next);
    if (nextNode) nextNode.next = head;
    r.snap(6, `head->next->next = head (${n.next} now points back to ${head})`);
    n.next = null;
    r.snap(7, `head->next = NULL`);
    r.snap(8, `Return new_head (${fmt(newHead)}) to the caller`);
    r.ret();
    return newHead;
  };

  const newHead = go(initialHead);
  r.setMainHead(newHead);
  r.snap(-1, `Back in main: head = ${fmt(newHead)}`);
  return r.frames;
}

function recFind(initialNodes: LLNode[], initialHead: string | null, value: number): Frame[] {
  const r = makeRecursiveRunner('find', initialNodes, initialHead);

  const go = (head: string | null): string | null => {
    r.call({ head, value });
    r.snap(0, `Called find_node(${fmt(head)}, ${value})`);
    r.snap(1, `Check if head is NULL`);
    if (head === null) {
      r.snap(1, `head is NULL, return NULL`);
      r.ret();
      return null;
    }
    const n = r.node(head);
    r.snap(3, `Check if head->value (${n?.value}) == ${value}`);
    if (n && n.value === value) {
      r.snap(3, `Found it. Return head (${head})`);
      r.ret();
      return head;
    }
    r.snap(5, `Not here. Search the rest: find_node(head->next, ${value})`);
    const result = go(n?.next ?? null);
    r.receive(result);
    r.snap(5, `Call returned ${fmt(result)}, pass it back up`);
    r.ret();
    return result;
  };

  const found = go(initialHead);
  r.snap(-1, found ? `Back in main: found ${value} at ${found}` : `Back in main: ${value} not found (NULL)`);
  return r.frames;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface OpArgs {
  value?: number;
  index?: number;
}

export function generateFrames(
  mode: Mode,
  op: OpType,
  nodes: LLNode[],
  head: string | null,
  args: OpArgs = {}
): Frame[] {
  const value = args.value ?? 0;
  const index = args.index ?? 0;
  if (mode === 'recursive') {
    switch (op) {
      case 'insert': return recInsert(nodes, head, value, index);
      case 'delete': return recDelete(nodes, head, value);
      case 'free': return recFree(nodes, head);
      case 'reverse': return recReverse(nodes, head);
      case 'find': return recFind(nodes, head, value);
    }
  }
  switch (op) {
    case 'insert': return withStack(iterInsert(nodes, head, value, index), op, head);
    case 'delete': return withStack(iterDelete(nodes, head, value), op, head);
    case 'free': return withStack(iterFree(nodes, head), op, head);
    case 'reverse': return withStack(iterReverse(nodes, head), op, head);
    case 'find': return withStack(iterFind(nodes, head, value), op, head);
  }
}
