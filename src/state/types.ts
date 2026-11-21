export interface LLNode {
  id: string;
  address: string;
  value: number | string;
  next: string | null;
  x: number;
  y: number;
}

export interface Variables {
  head: string | null;
  [key: string]: any;
}

export type OpType = 'insert' | 'delete' | 'free' | 'reverse' | 'find';
export type Mode = 'iterative' | 'recursive';

export interface StackFrame {
  id: number;
  fn: string;
  locals: Record<string, any>;
  /** Value this call just got back from a recursive call, shown briefly */
  returned?: { value: string | null };
}

export interface Frame {
  nodes: LLNode[];
  /** Locals of the function currently executing (drawn as pointer arrows) */
  variables: Variables;
  lineIndex: number;
  explanation: string;
  codeSnippet: string;
  op: OpType;
  /** Call stack, bottom (main) first */
  stack: StackFrame[];
  /** The list's head as seen by main */
  listHead: string | null;
  /** Addresses to highlight (overrides the default curr/temp/prev logic) */
  highlight?: string[];
}

export const CODE_INSERT = `struct node *insert_at_index(struct node *head, int value, int index) {
    struct node *new_node = malloc(sizeof(struct node));
    new_node->value = value;
    new_node->next = NULL;

    if (index == 0 || head == NULL) {
        new_node->next = head;
        return new_node;
    }

    struct node *curr = head;
    for (int i = 0; i < index - 1 && curr->next != NULL; i++) {
        curr = curr->next;
    }

    new_node->next = curr->next;
    curr->next = new_node;
    return head;
}`;

export const CODE_DELETE = `struct node *delete_node(struct node *head, int value) {
    if (head == NULL) return NULL;

    if (head->value == value) {
        struct node *temp = head;
        head = head->next;
        free(temp);
        return head;
    }

    struct node *curr = head;
    while (curr->next != NULL && curr->next->value != value) {
        curr = curr->next;
    }

    if (curr->next != NULL) {
        struct node *temp = curr->next;
        curr->next = temp->next;
        free(temp);
    }
    return head;
}`;

export const CODE_FREE = `void free_list(struct node *head) {
    struct node *curr = head;
    while (curr != NULL) {
        struct node *temp = curr;
        curr = curr->next;
        free(temp);
    }
}`;

export const CODE_REVERSE = `struct node *reverse_list(struct node *head) {
    struct node *prev = NULL;
    struct node *curr = head;
    struct node *next_node = NULL;

    while (curr != NULL) {
        next_node = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next_node;
    }
    
    return prev;
}`;

export const CODE_FIND = `struct node *find_node(struct node *head, int value) {
    struct node *curr = head;
    
    while (curr != NULL) {
        if (curr->value == value) {
            return curr;
        }
        curr = curr->next;
    }
    
    return NULL;
}`;

// ---------------------------------------------------------------------------
// Recursive versions
// ---------------------------------------------------------------------------

export const CODE_INSERT_REC = `struct node *insert_at_index(struct node *head, int value, int index) {
    if (index == 0 || head == NULL) {
        struct node *new_node = malloc(sizeof(struct node));
        new_node->value = value;
        new_node->next = head;
        return new_node;
    }

    head->next = insert_at_index(head->next, value, index - 1);
    return head;
}`;

export const CODE_DELETE_REC = `struct node *delete_node(struct node *head, int value) {
    if (head == NULL) return NULL;

    if (head->value == value) {
        struct node *rest = head->next;
        free(head);
        return rest;
    }

    head->next = delete_node(head->next, value);
    return head;
}`;

export const CODE_FREE_REC = `void free_list(struct node *head) {
    if (head == NULL) return;

    free_list(head->next);
    free(head);
}`;

export const CODE_REVERSE_REC = `struct node *reverse_list(struct node *head) {
    if (head == NULL || head->next == NULL) {
        return head;
    }

    struct node *new_head = reverse_list(head->next);
    head->next->next = head;
    head->next = NULL;
    return new_head;
}`;

export const CODE_FIND_REC = `struct node *find_node(struct node *head, int value) {
    if (head == NULL) return NULL;

    if (head->value == value) return head;

    return find_node(head->next, value);
}`;

export const CODE: Record<Mode, Record<OpType, string>> = {
  iterative: {
    insert: CODE_INSERT,
    delete: CODE_DELETE,
    free: CODE_FREE,
    reverse: CODE_REVERSE,
    find: CODE_FIND,
  },
  recursive: {
    insert: CODE_INSERT_REC,
    delete: CODE_DELETE_REC,
    free: CODE_FREE_REC,
    reverse: CODE_REVERSE_REC,
    find: CODE_FIND_REC,
  },
};

export const FN_NAMES: Record<OpType, string> = {
  insert: 'insert_at_index',
  delete: 'delete_node',
  free: 'free_list',
  reverse: 'reverse_list',
  find: 'find_node',
};
