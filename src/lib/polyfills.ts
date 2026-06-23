/**
 * Runtime polyfills. Must be imported before any code that depends on them.
 *
 * jpeg-js (used to decode captured photos and encode the exported panorama) relies
 * on Node's global `Buffer`, which doesn't exist in the Hermes/React Native runtime.
 * Provide it from the pure-JS `buffer` package.
 */
import { Buffer } from 'buffer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}
