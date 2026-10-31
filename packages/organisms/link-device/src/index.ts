import { LinkDevice } from './component.js';

// export 
export * from "./component";
export * from "./types";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pc-link-device')) {
  window.customElements.define('pc-link-device', LinkDevice);
}
