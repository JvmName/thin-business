declare namespace Pebble {
  function addEventListener(event: 'ready', handler: (e: { ready: boolean }) => void): void;
  function addEventListener(event: 'appmessage', handler: (e: { payload: Record<string, number | string> }) => void): void;
  function addEventListener(event: 'showConfiguration' | 'webviewclosed', handler: (e: any) => void): void;
  function sendAppMessage(
    dict: Record<number | string, number | string | number[]>,
    success?: (e: any) => void,
    error?: (e: any) => void
  ): void;
}
