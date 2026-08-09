import { describe, expect, it, vi } from 'vitest';
import { createUiCommand } from '../uiCommand';

describe('createUiCommand', () => {
  it('latches a command until a handler registers', () => {
    const command = createUiCommand();
    const handler = vi.fn();
    command.invoke();
    const unregister = command.register(handler);
    expect(handler).toHaveBeenCalledOnce();
    unregister();
    command.invoke();
    expect(handler).toHaveBeenCalledOnce();
  });
});
