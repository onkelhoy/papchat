import { DevicePicker } from './component.js';

// export 
export * from "./component";
export * from "./types";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pc-device-picker')) {
  window.customElements.define('pc-device-picker', DevicePicker);
}
