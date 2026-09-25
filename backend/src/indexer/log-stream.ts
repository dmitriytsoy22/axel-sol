import { Logger } from '@nestjs/common';
import type { Logs, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';

export const INDEXER_LOGS = Symbol('INDEXER_LOGS');

export interface LogHandlers {
  onLogs(logs: Logs, slot: number): void;
  /**
   * The connection was lost and the subscription is back. Notifications sent in between
   * are gone, so the caller should catch up from the history.
   */
  onResubscribed(): void;
}

/** A `logsSubscribe` subscription to the transactions that mention one program. */
export interface LogStream {
  subscribe(programId: PublicKey, handlers: LogHandlers): void;
  /** Stops reconnecting and resolves once the socket is closed. */
  close(): Promise<void>;
}

export interface WebSocketLogStreamOptions {
  /** Delay before reconnect attempt `attempt` (from 1). */
  retryDelayMs: (attempt: number) => number;
  /** How often the socket is pinged; a missing pong by the next ping reopens it. */
  heartbeatMs: number;
}

interface RpcMessage {
  id?: number;
  result?: unknown;
  error?: unknown;
  method?: string;
  params?: {
    subscription?: number;
    result?: { context: { slot: number }; value: Logs };
  };
}

const SUBSCRIBE_REQUEST_ID = 1;

/**
 * `logsSubscribe` at `confirmed` over one websocket. A lost connection is reopened with
 * backoff and subscribed again, and a ping detects a connection that died without closing.
 * web3.js hides its reconnects and keeps an idle socket open for 500 ms after the last
 * unsubscribe, so it can say neither when to catch up nor when shutdown is complete.
 */
export class WebSocketLogStream implements LogStream {
  private readonly logger = new Logger(WebSocketLogStream.name);
  private socket: WebSocket | null = null;
  private programId = '';
  private subscription: number | null = null;
  private subscribedBefore = false;
  private attempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly options: WebSocketLogStreamOptions,
  ) {}

  subscribe(programId: PublicKey, handlers: LogHandlers): void {
    this.programId = programId.toBase58();
    this.connect(handlers);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    if (socket === null) {
      return;
    }
    await new Promise<void>((done) => {
      socket.once('close', () => done());
      socket.terminate();
    });
  }

  private connect(handlers: LogHandlers): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    let answered = true;
    const heartbeat = setInterval(() => {
      if (!answered) {
        this.logger.warn('The RPC websocket stopped answering pings; reconnecting');
        socket.terminate();
        return;
      }
      answered = false;
      socket.ping();
    }, this.options.heartbeatMs);

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: SUBSCRIBE_REQUEST_ID,
          method: 'logsSubscribe',
          params: [{ mentions: [this.programId] }, { commitment: 'confirmed' }],
        }),
      );
    });
    socket.on('pong', () => {
      answered = true;
    });
    // With the default binaryType every message arrives as one Buffer.
    socket.on('message', (data: Buffer) => this.onMessage(socket, data, handlers));
    socket.on('error', (err) => {
      this.logger.warn(`RPC websocket error: ${err.message}`);
    });
    socket.on('close', () => {
      clearInterval(heartbeat);
      this.onClose(socket, handlers);
    });
  }

  private onMessage(socket: WebSocket, data: Buffer, handlers: LogHandlers): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(data.toString('utf-8')) as RpcMessage;
    } catch {
      this.logger.warn('The RPC websocket sent a message that is not JSON');
      return;
    }
    if (message.id === SUBSCRIBE_REQUEST_ID) {
      if (typeof message.result !== 'number') {
        this.logger.warn(`logsSubscribe was refused: ${JSON.stringify(message.error)}`);
        socket.terminate();
        return;
      }
      this.subscription = message.result;
      this.attempts = 0;
      if (this.subscribedBefore) {
        handlers.onResubscribed();
      }
      this.subscribedBefore = true;
      return;
    }
    const result = message.params?.result;
    if (
      message.method === 'logsNotification' &&
      message.params?.subscription === this.subscription &&
      result !== undefined
    ) {
      handlers.onLogs(result.value, result.context.slot);
    }
  }

  private onClose(socket: WebSocket, handlers: LogHandlers): void {
    if (this.socket === socket) {
      this.socket = null;
      this.subscription = null;
    }
    if (this.closed) {
      return;
    }
    this.attempts += 1;
    const delay = this.options.retryDelayMs(this.attempts);
    this.logger.warn(`RPC websocket closed; reconnecting in ${delay} ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(handlers);
    }, delay);
  }
}
