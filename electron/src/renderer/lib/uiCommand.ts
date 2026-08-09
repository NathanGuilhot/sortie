export function createUiCommand(): {
  invoke: () => void;
  register: (handler: () => void) => () => void;
} {
  let handler: (() => void) | undefined;
  let pending = false;
  return {
    invoke: () => {
      if (handler) handler();
      else pending = true;
    },
    register: (next) => {
      handler = next;
      if (pending) {
        pending = false;
        next();
      }
      return () => {
        if (handler === next) handler = undefined;
      };
    },
  };
}
