/// <reference types="vite/client" />

declare module '*?worker' {
  const Worker: new () => Worker;
  export default Worker;
}
