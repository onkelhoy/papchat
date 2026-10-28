import { CallStage } from './component.js';

// export 
export * from "./component";
export * from "./types";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pc-call-stage')) {
  window.customElements.define('pc-call-stage', CallStage);
}
