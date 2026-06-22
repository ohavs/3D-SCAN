/**
 * GLSL ES 1.00 shaders for the panorama engine. Kept as strings so Metro needs no
 * custom transformer. Three passes share one full-screen-quad vertex shader:
 *
 *   1. BLEND   — projects a captured photo into the equirectangular accumulation
 *                buffer (the core stitching pass). Ping-pong: reads prev, writes new.
 *   2. DISPLAY — reverse equirect lookup that paints the accumulated panorama onto
 *                the screen through the live device orientation (the Photaf effect).
 *   3. EXPORT  — copies the accumulation buffer into an RGBA8 target for snapshot,
 *                filling never-seen texels with a neutral colour.
 *
 * Camera frame convention (matches src/lib/orientation.ts): the camera looks down
 * its local -Z axis, +X right, +Y up. `uRot` is the camera->world matrix (mat3).
 */

export const FULLSCREEN_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const BLEND_FRAG = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uPrev;   // previous accumulation (rgb, a = weight 0..1)
uniform sampler2D uPhoto;  // captured photo
uniform mat3 uRot;         // camera->world for this capture
uniform float uTanU;       // tan(fovU/2)
uniform float uTanV;       // tan(fovV/2)
uniform float uMirrorX;    // 0 or 1
uniform float uMirrorY;    // 0 or 1
uniform float uFeather;    // edge feather width (normalized, e.g. 0.35)
uniform float uIncidencePow;
uniform float uGlobalWeight;

const float PI = 3.141592653589793;

void main() {
  // Equirect texel -> world direction.
  float lon = (vUv.x - 0.5) * 2.0 * PI;
  float lat = (0.5 - vUv.y) * PI;
  float cl = cos(lat);
  vec3 D = vec3(cl * sin(lon), sin(lat), cl * cos(lon));

  vec4 prev = texture2D(uPrev, vUv);

  // World -> camera (Dc = R^T * D). Camera looks down -Z, so front is Dc.z < 0.
  vec3 Dc = vec3(dot(uRot[0], D), dot(uRot[1], D), dot(uRot[2], D));
  float t = -Dc.z;
  if (t <= 0.0001) { gl_FragColor = prev; return; }

  float up = 0.5 + (Dc.x / t) / (2.0 * uTanU);
  float vp = 0.5 - (Dc.y / t) / (2.0 * uTanV);
  if (uMirrorX > 0.5) up = 1.0 - up;
  if (uMirrorY > 0.5) vp = 1.0 - vp;

  if (up < 0.0 || up > 1.0 || vp < 0.0 || vp > 1.0) { gl_FragColor = prev; return; }

  // Feather toward the photo edges so overlaps cross-fade.
  float ex = min(up, 1.0 - up);
  float ey = min(vp, 1.0 - vp);
  float feather = smoothstep(0.0, uFeather, ex) * smoothstep(0.0, uFeather, ey);

  // Incidence: down-weight texels far from the optical axis (= -column2 in world).
  vec3 fwd = -normalize(uRot[2]);
  float inc = max(dot(D, fwd), 0.0);
  float w = feather * pow(inc, uIncidencePow) * uGlobalWeight;
  if (w <= 0.0) { gl_FragColor = prev; return; }

  vec3 photo = texture2D(uPhoto, vec2(up, vp)).rgb;
  float newA = min(prev.a + w, 1.0);
  vec3 newRgb = (prev.rgb * prev.a + photo * w) / max(newA, 1e-4);
  gl_FragColor = vec4(newRgb, newA);
}
`;

export const DISPLAY_FRAG = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uAccum;
uniform mat3 uRot;     // camera->world for the live device orientation
uniform float uTanU;   // tan(displayFovU/2)
uniform float uTanV;   // tan(displayFovV/2)
uniform float uMinWeight; // below this, show live camera (transparent)
uniform float uDim;       // dim painted regions slightly (0..1)

const float PI = 3.141592653589793;

void main() {
  // Screen pixel -> camera ray (camera looks down -Z).
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ray = normalize(vec3(ndc.x * uTanU, ndc.y * uTanV, -1.0));
  vec3 D = normalize(uRot * ray);

  float lon = atan(D.x, D.z);
  float lat = asin(clamp(D.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);

  vec4 acc = texture2D(uAccum, uv);
  float a = smoothstep(uMinWeight, uMinWeight + 0.25, acc.a);
  // Premultiplied alpha: Android's TextureView composites the GL surface over the
  // live camera assuming premultiplied colour.
  gl_FragColor = vec4(acc.rgb * (1.0 - uDim) * a, a);
}
`;

export const EXPORT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uAccum;
uniform vec3 uFill; // colour for never-captured texels
void main() {
  vec4 acc = texture2D(uAccum, vUv);
  vec3 rgb = mix(uFill, acc.rgb, step(0.001, acc.a));
  gl_FragColor = vec4(rgb, 1.0);
}
`;
