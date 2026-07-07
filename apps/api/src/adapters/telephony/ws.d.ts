declare module 'ws' {
  export interface WebSocket {
    readonly readyState: number;
    on(event: 'open', listener: () => void): this;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    send(data: string | Buffer): void;
    close(): void;
  }
  export default class WebSocket implements WebSocket {
    readonly readyState: number;
    constructor(url: string, options?: { headers?: Record<string, string> });
    on(event: 'open', listener: () => void): this;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    send(data: string | Buffer): void;
    close(): void;
  }
}
