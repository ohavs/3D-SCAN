/**
 * The panorama engine. Holds two ping-pong equirectangular accumulation buffers and
 * runs the three shader passes (blend / display / export). All heavy GL state lives
 * here; React screens only feed it orientations and read back a snapshot URI.
 */

import { GLView } from 'expo-gl';
import { Quat, quatToMat3 } from '../lib/quaternion';
import { fovTangents } from '../lib/fov';
import {
  BLEND_FRAG,
  DISPLAY_FRAG,
  EXPORT_FRAG,
  FULLSCREEN_VERT,
} from '../shaders';
import {
  GL,
  RenderTarget,
  bindQuad,
  clearTarget,
  createFullscreenQuad,
  createProgram,
  createRenderTarget,
  loadTextureFromUri,
} from './glHelpers';

export interface CaptureRecord {
  uri: string;
  width: number; // photo pixel width (from takePictureAsync)
  height: number; // photo pixel height
  rot: Quat; // camera->world at capture time
  referenceFovDeg: number;
  mirrorX: boolean;
  mirrorY: boolean;
}

export interface CompositorOptions {
  outputWidth: number; // e.g. 4096
  outputHeight: number; // e.g. 2048
  feather?: number; // edge feather width (normalized), default 0.35
  incidencePow?: number; // optical-axis weighting, default 1.5
}

const FILL_COLOR: readonly [number, number, number] = [0.05, 0.05, 0.06];

export class Compositor {
  private gl: GL;
  private opts: Required<CompositorOptions>;

  private blendProgram!: WebGLProgram;
  private displayProgram!: WebGLProgram;
  private exportProgram!: WebGLProgram;
  private quad!: WebGLBuffer;

  private targets!: [RenderTarget, RenderTarget];
  private front = 0; // index of the target holding the current result

  private captures: CaptureRecord[] = [];

  constructor(gl: GL, options: CompositorOptions) {
    this.gl = gl;
    this.opts = {
      feather: 0.35,
      incidencePow: 1.5,
      ...options,
    };
  }

  init(): void {
    const gl = this.gl;
    this.blendProgram = createProgram(gl, FULLSCREEN_VERT, BLEND_FRAG);
    this.displayProgram = createProgram(gl, FULLSCREEN_VERT, DISPLAY_FRAG);
    this.exportProgram = createProgram(gl, FULLSCREEN_VERT, EXPORT_FRAG);
    this.quad = createFullscreenQuad(gl);
    this.targets = [
      createRenderTarget(gl, this.opts.outputWidth, this.opts.outputHeight),
      createRenderTarget(gl, this.opts.outputWidth, this.opts.outputHeight),
    ];
    clearTarget(gl, this.targets[0]);
    clearTarget(gl, this.targets[1]);
  }

  get captureCount(): number {
    return this.captures.length;
  }

  private get frontTarget(): RenderTarget {
    return this.targets[this.front]!;
  }

  private get backTarget(): RenderTarget {
    return this.targets[this.front ^ 1]!;
  }

  /** Blend `photoTex` (with size texW/texH) into `back`, reading `prev`. */
  private blendPass(
    prevTex: WebGLTexture,
    photoTex: WebGLTexture,
    texW: number,
    texH: number,
    rot: Quat,
    calib: { referenceFovDeg: number; mirrorX: boolean; mirrorY: boolean },
    target: RenderTarget,
  ): void {
    const gl = this.gl;
    const { tanU, tanV } = fovTangents(calib.referenceFovDeg, texW, texH);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.blendProgram);
    bindQuad(gl, this.blendProgram, this.quad);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProgram, 'uPrev'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, photoTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProgram, 'uPhoto'), 1);

    gl.uniformMatrix3fv(
      gl.getUniformLocation(this.blendProgram, 'uRot'),
      false,
      quatToMat3(rot),
    );
    gl.uniform1f(gl.getUniformLocation(this.blendProgram, 'uTanU'), tanU);
    gl.uniform1f(gl.getUniformLocation(this.blendProgram, 'uTanV'), tanV);
    gl.uniform1f(
      gl.getUniformLocation(this.blendProgram, 'uMirrorX'),
      calib.mirrorX ? 1 : 0,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.blendProgram, 'uMirrorY'),
      calib.mirrorY ? 1 : 0,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.blendProgram, 'uFeather'),
      this.opts.feather,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.blendProgram, 'uIncidencePow'),
      this.opts.incidencePow,
    );
    gl.uniform1f(gl.getUniformLocation(this.blendProgram, 'uGlobalWeight'), 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Add a captured photo: load it, blend into the accumulation buffer, swap. */
  async addCaptureAsync(record: CaptureRecord): Promise<void> {
    const gl = this.gl;
    const photo = await loadTextureFromUri(gl, record.uri);
    // Use the dimensions reported by the camera (asset dims can be 0 for file URIs).
    const texW = record.width || photo.width || 1;
    const texH = record.height || photo.height || 1;
    this.blendPass(
      this.frontTarget.texture,
      photo.texture,
      texW,
      texH,
      record.rot,
      {
        referenceFovDeg: record.referenceFovDeg,
        mirrorX: record.mirrorX,
        mirrorY: record.mirrorY,
      },
      this.backTarget,
    );
    this.front ^= 1; // back becomes front
    gl.deleteTexture(photo.texture); // photo is baked in; free GPU memory
    this.captures.push(record);
  }

  /** Re-blend every record from a cleared buffer (used by undo / reset+replay). */
  private async rebuildAsync(records: CaptureRecord[]): Promise<void> {
    const gl = this.gl;
    clearTarget(gl, this.targets[0]);
    clearTarget(gl, this.targets[1]);
    this.front = 0;
    this.captures = [];
    for (const r of records) {
      // eslint-disable-next-line no-await-in-loop
      await this.addCaptureAsync(r);
    }
  }

  /** Remove the most recent capture. Returns the removed record (if any). */
  async undoLastAsync(): Promise<CaptureRecord | undefined> {
    if (this.captures.length === 0) return undefined;
    const remaining = this.captures.slice(0, -1);
    const removed = this.captures[this.captures.length - 1];
    await this.rebuildAsync(remaining);
    return removed;
  }

  async resetAsync(): Promise<void> {
    await this.rebuildAsync([]);
  }

  /**
   * Draw the accumulated panorama onto the on-screen framebuffer through the live
   * device orientation. Call once per animation frame (caller runs endFrameEXP).
   */
  renderDisplay(
    viewRot: Quat,
    displayTanU: number,
    displayTanV: number,
    screenWidth: number,
    screenHeight: number,
    minWeight = 0.04,
    dim = 0.12,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenWidth, screenHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Single fullscreen pass writing premultiplied colour; no GL blending needed.
    gl.disable(gl.BLEND);

    gl.useProgram(this.displayProgram);
    bindQuad(gl, this.displayProgram, this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTarget.texture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'uAccum'), 0);
    gl.uniformMatrix3fv(
      gl.getUniformLocation(this.displayProgram, 'uRot'),
      false,
      quatToMat3(viewRot),
    );
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'uTanU'), displayTanU);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'uTanV'), displayTanV);
    gl.uniform1f(
      gl.getUniformLocation(this.displayProgram, 'uMinWeight'),
      minWeight,
    );
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'uDim'), dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Render the accumulation buffer into an RGBA8 target and snapshot it to a JPEG
   * file (encoded natively by expo-gl). Returns the file URI.
   */
  async exportJpegAsync(quality = 0.92): Promise<string> {
    const gl = this.gl;
    const out = createRenderTarget(gl, this.opts.outputWidth, this.opts.outputHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.framebuffer);
    gl.viewport(0, 0, out.width, out.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.exportProgram);
    bindQuad(gl, this.exportProgram, this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTarget.texture);
    gl.uniform1i(gl.getUniformLocation(this.exportProgram, 'uAccum'), 0);
    gl.uniform3f(
      gl.getUniformLocation(this.exportProgram, 'uFill'),
      FILL_COLOR[0],
      FILL_COLOR[1],
      FILL_COLOR[2],
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const snapshot = await GLView.takeSnapshotAsync(gl, {
      framebuffer: out.framebuffer,
      rect: { x: 0, y: 0, width: out.width, height: out.height },
      flip: true, // GL framebuffers are bottom-up; flip so north is on top
      format: 'jpeg',
      compress: quality,
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(out.framebuffer);
    gl.deleteTexture(out.texture);

    const uri =
      typeof snapshot.localUri === 'string' ? snapshot.localUri : snapshot.uri;
    return uri as string;
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.targets ?? []) {
      gl.deleteFramebuffer(t.framebuffer);
      gl.deleteTexture(t.texture);
    }
    gl.deleteProgram(this.blendProgram);
    gl.deleteProgram(this.displayProgram);
    gl.deleteProgram(this.exportProgram);
    gl.deleteBuffer(this.quad);
  }
}
