import { Logger } from '@nestjs/common';
import { Keypair, type Logs } from '@solana/web3.js';
import type { AddressInfo } from 'net';
import { type WebSocket, WebSocketServer } from 'ws';

import { type LogHandlers, WebSocketLogStream } from './log-stream';

interface SubscribeRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: unknown[];
}

/** A websocket endpoint of a Solana RPC node that answers `logsSubscribe`. */
class FakePubsub {
  readonly requests: SubscribeRequest[] = [];
  /** How the next subscribe requests are answered; default: accepted. */
  readonly refusals: string[] = [];
  private readonly waiting: ((socket: WebSocket) => void)[] = [];
  private readonly subscribed: { socket: WebSocket; subscription: number }[] = [];
  private nextSubscription = 100;

  private constructor(readonly server: WebSocketServer) {
    server.on('connection', (socket) => {
      socket.on('message', (data: Buffer) => {
        const request = JSON.parse(data.toString()) as SubscribeRequest;
        this.requests.push(request);
        const refusal = this.refusals.shift();
        if (refusal !== undefined) {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32602, message: refusal },
            }),
          );
          return;
        }
        const subscription = this.nextSubscription++;
        this.subscribed.push({ socket, subscription });
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: subscription }));
        this.waiting.shift()?.(socket);
      });
    });
  }

  static start(options: { port?: number; autoPong?: boolean } = {}): Promise<FakePubsub> {
    return new Promise((ready) => {
      const server: WebSocketServer = new WebSocketServer(
        { host: '127.0.0.1', port: options.port ?? 0, autoPong: options.autoPong ?? true },
        () => ready(new FakePubsub(server)),
      );
    });
  }

  get url(): string {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  /** Resolves with the socket of the next accepted subscription. */
  nextSubscriber(): Promise<WebSocket> {
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  notify(
    socket: WebSocket,
    logs: Logs,
    slot: number,
    subscription = this.subscriptionOf(socket),
  ): void {
    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'logsNotification',
        params: { result: { context: { slot }, value: logs }, subscription },
      }),
    );
  }

  close(): Promise<void> {
    for (const client of this.server.clients) {
      client.terminate();
    }
    return new Promise((done) => this.server.close(() => done()));
  }

  private subscriptionOf(socket: WebSocket): number {
    const entry = this.subscribed.find((candidate) => candidate.socket === socket);
    if (entry === undefined) {
      throw new Error('The socket has no subscription');
    }
    return entry.subscription;
  }
}

/** Handlers that hand each call to whoever waits for it. */
class Recorder implements LogHandlers {
  readonly logs: { logs: Logs; slot: number }[] = [];
  resubscriptions = 0;
  private logWaiters: (() => void)[] = [];
  private resubscribeWaiters: (() => void)[] = [];

  onLogs(logs: Logs, slot: number): void {
    this.logs.push({ logs, slot });
    this.logWaiters.shift()?.();
  }

  onResubscribed(): void {
    this.resubscriptions += 1;
    this.resubscribeWaiters.shift()?.();
  }

  nextLogs(): Promise<void> {
    return new Promise((resolve) => this.logWaiters.push(resolve));
  }

  nextResubscription(): Promise<void> {
    return new Promise((resolve) => this.resubscribeWaiters.push(resolve));
  }
}

function transaction(signature: string): Logs {
  return { signature, err: null, logs: [`Program log: ${signature}`] };
}

const programId = Keypair.generate().publicKey;

describe('WebSocketLogStream', () => {
  let pubsub: FakePubsub;
  let stream: WebSocketLogStream;
  let retries: number[];

  function open(url: string, heartbeatMs = 60_000): WebSocketLogStream {
    retries = [];
    stream = new WebSocketLogStream(url, {
      retryDelayMs: (attempt) => {
        retries.push(attempt);
        return 0;
      },
      heartbeatMs,
    });
    return stream;
  }

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  afterEach(async () => {
    await stream.close();
    await pubsub.close();
  });

  it("subscribes to the program's logs at confirmed and delivers only its own notifications", async () => {
    pubsub = await FakePubsub.start();
    const recorder = new Recorder();
    const subscribed = pubsub.nextSubscriber();
    open(pubsub.url).subscribe(programId, recorder);
    const socket = await subscribed;

    expect(pubsub.requests).toEqual([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'logsSubscribe',
        params: [{ mentions: [programId.toBase58()] }, { commitment: 'confirmed' }],
      },
    ]);

    const delivered = recorder.nextLogs();
    pubsub.notify(socket, transaction('other'), 7, 999);
    socket.send('not json');
    pubsub.notify(socket, transaction('mine'), 8);
    await delivered;

    expect(recorder.logs).toEqual([{ logs: transaction('mine'), slot: 8 }]);
  });

  it('reconnects after the connection drops, subscribes again and asks the caller to catch up', async () => {
    pubsub = await FakePubsub.start();
    const recorder = new Recorder();
    const first = pubsub.nextSubscriber();
    open(pubsub.url).subscribe(programId, recorder);
    const dropped = await first;
    expect(recorder.resubscriptions).toBe(0);

    const second = pubsub.nextSubscriber();
    const caughtUp = recorder.nextResubscription();
    dropped.terminate();
    const socket = await second;
    await caughtUp;

    const delivered = recorder.nextLogs();
    pubsub.notify(socket, transaction('after'), 9);
    await delivered;
    expect(recorder.resubscriptions).toBe(1);
    expect(recorder.logs).toEqual([{ logs: transaction('after'), slot: 9 }]);
    expect(retries).toEqual([1]);
  });

  it('keeps retrying while the node is down and starts the backoff over once subscribed', async () => {
    const reserved = await FakePubsub.start();
    const url = reserved.url;
    const port = Number(new URL(url).port);
    await reserved.close();
    const recorder = new Recorder();
    open(url).subscribe(programId, recorder);

    pubsub = await FakePubsub.start({ port });
    const socket = await pubsub.nextSubscriber();
    const attemptsWhileDown = retries.length;
    const back = pubsub.nextSubscriber();
    socket.terminate();
    await back;

    expect(attemptsWhileDown).toBeGreaterThan(0);
    expect(retries.slice(0, attemptsWhileDown)).toEqual(
      Array.from({ length: attemptsWhileDown }, (_, i) => i + 1),
    );
    expect(retries.slice(attemptsWhileDown)).toEqual([1]);
    expect(recorder.resubscriptions).toBe(0);
  });

  it('reconnects when the node refuses the subscription', async () => {
    pubsub = await FakePubsub.start();
    pubsub.refusals.push('Invalid params');
    const recorder = new Recorder();
    const accepted = pubsub.nextSubscriber();
    open(pubsub.url).subscribe(programId, recorder);
    const socket = await accepted;

    const delivered = recorder.nextLogs();
    pubsub.notify(socket, transaction('accepted'), 3);
    await delivered;

    expect(pubsub.requests).toHaveLength(2);
    expect(retries).toEqual([1]);
    expect(recorder.resubscriptions).toBe(0);
  });

  it('reopens a connection that stops answering pings', async () => {
    pubsub = await FakePubsub.start({ autoPong: false });
    const recorder = new Recorder();
    const first = pubsub.nextSubscriber();
    open(pubsub.url, 20).subscribe(programId, recorder);
    await first;

    const reopened = recorder.nextResubscription();
    await reopened;

    expect(retries[0]).toBe(1);
  });

  it('stops for good on close and resolves once the socket is closed', async () => {
    pubsub = await FakePubsub.start();
    const recorder = new Recorder();
    const subscribed = pubsub.nextSubscriber();
    open(pubsub.url).subscribe(programId, recorder);
    const socket = await subscribed;
    const serverSawClose = new Promise<void>((done) => socket.once('close', () => done()));

    await stream.close();
    await serverSawClose;

    expect(retries).toEqual([]);
    expect(pubsub.server.clients.size).toBe(0);
  });
});
