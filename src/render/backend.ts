// The few canvas members text rasterising needs. Browser contexts satisfy it as they are; the CLI
// registers a factory backed by a Node canvas so the same measuring and drawing code runs there.
export interface TextContext {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

export type CanvasFactory = (w: number, h: number) => TextContext;

let factory: CanvasFactory | null = null;

export function setCanvasFactory(next: CanvasFactory | null): void {
  factory = next;
}

export function canvasFactory(): CanvasFactory | null {
  return factory;
}
