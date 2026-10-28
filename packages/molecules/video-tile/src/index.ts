import { VideoTile } from './component.js';

// export 
export * from "./component";
export * from "./types";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pc-video-tile')) {
  window.customElements.define('pc-video-tile', VideoTile);
}
