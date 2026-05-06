// Module shims so TypeScript can resolve Pebble/Moddable imports.
// The actual implementations are provided by the Pebble SDK at build time.

declare module "embedded:sensor/Battery" {
  interface BatteryOptions {
    onSample?: () => void;
  }
  interface BatterySample {
    percent: number;
    charging: boolean;
    plugged: boolean;
  }
  class Battery {
    constructor(options: BatteryOptions);
    close(): void;
    configure(options: {}): void;
    sample(): BatterySample;
  }
  export default Battery;
  export type { BatterySample };
}

declare module "pebble/message" {
  interface MessageOptions {
    onReadable?: () => void;
    onWritable?: (count: number) => void;
    onSuspend?: () => void;
    format?: "map";
    input?: number;
    output?: number;
    keys?: Map<string, number> | Array<string>;
  }
  type MessageKey = string | number;
  type MessageReadValue = number | string | ArrayBuffer;
  type MessageWriteValue = number | string | boolean;
  class Message {
    constructor(options: MessageOptions);
    close(): void;
    read(): Map<MessageKey, MessageReadValue>;
    write(map: Map<MessageKey, MessageWriteValue>): void;
    get format(): "map";
    get input(): number;
    get output(): number;
  }
  export default Message;
}
