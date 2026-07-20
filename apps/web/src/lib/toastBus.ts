export type ToastType = "success" | "error";

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

type Listener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
let listeners: Listener[] = [];
let counter = 0;

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function pushToast(type: ToastType, message: string) {
  const id = ++counter;
  toasts = [...toasts, { id, type, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3500);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
