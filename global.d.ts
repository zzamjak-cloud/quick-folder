// Vite define에서 주입되는 전역 상수
declare const __APP_VERSION__: string;

declare module '*?url' {
  const src: string;
  export default src;
}
