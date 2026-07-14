export interface Command {
  label: string;
  undo(): void;
  redo(): void;
}

const undoStack: Command[] = [];
const redoStack: Command[] = [];
const cbs: Array<() => void> = [];

export function onChange(cb: () => void): void { cbs.push(cb); }
const emit = (): void => cbs.forEach(cb => cb());

export function push(cmd: Command): void {
  undoStack.push(cmd);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  emit();
}

export function undo(): void {
  const cmd = undoStack.pop();
  if (!cmd) return;
  cmd.undo();
  redoStack.push(cmd);
  emit();
}

export function redo(): void {
  const cmd = redoStack.pop();
  if (!cmd) return;
  cmd.redo();
  undoStack.push(cmd);
  emit();
}

export function undoAll(): void {
  while (undoStack.length) undo();
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }
