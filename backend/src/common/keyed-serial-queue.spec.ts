import { KeyedSerialQueue } from './keyed-serial-queue';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('KeyedSerialQueue', () => {
  it('starts a task only after the previous task with the same key has finished', async () => {
    const queue = new KeyedSerialQueue();
    const gate = deferred();
    const log: string[] = [];

    const first = queue.run('wallet-a', async () => {
      log.push('first started');
      await gate.promise;
      log.push('first finished');
    });
    const second = queue.run('wallet-a', () => {
      log.push('second started');
      return Promise.resolve();
    });
    await Promise.resolve();
    gate.resolve();
    await Promise.all([first, second]);

    expect(log).toEqual(['first started', 'first finished', 'second started']);
  });

  it('runs tasks with different keys without waiting for each other', async () => {
    const queue = new KeyedSerialQueue();
    const gate = deferred();

    const blocked = queue.run('wallet-a', () => gate.promise);
    const other = await queue.run('wallet-b', () => Promise.resolve('done'));
    gate.resolve();
    await blocked;

    expect(other).toBe('done');
  });

  it('passes a failure to its caller and still runs the next task for the key', async () => {
    const queue = new KeyedSerialQueue();

    const failing = queue.run('wallet-a', () => Promise.reject(new Error('rpc down')));
    const next = queue.run('wallet-a', () => Promise.resolve('applied'));

    await expect(failing).rejects.toThrow('rpc down');
    await expect(next).resolves.toBe('applied');
  });
});
