import '@testing-library/jest-dom/vitest';

// jsdom 환경에 따라 localStorage 메서드(clear 등)가 누락되어 테스트가 깨지는 것을 방지.
// Map 기반 완전 구현으로 교체(테스트 격리에도 유리).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});

// jsdom은 canvas 2D context를 구현하지 않으므로, 캔버스 기반 UI 테스트의 기본 mock을 제공한다.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    arc: () => {},
    beginPath: () => {},
    clearRect: () => {},
    closePath: () => {},
    drawImage: () => {},
    ellipse: () => {},
    fill: () => {},
    fillRect: () => {},
    fillText: () => {},
    lineTo: () => {},
    measureText: () => ({ width: 0 }),
    moveTo: () => {},
    restore: () => {},
    roundRect: () => {},
    save: () => {},
    stroke: () => {},
    strokeRect: () => {},
  }),
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: () => 'data:image/png;base64,',
});
