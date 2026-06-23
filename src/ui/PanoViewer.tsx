import React, { useCallback, useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import {
  Quat,
  quatFromAxisAngle,
  quatMultiply,
} from '../lib/quaternion';
import { DISPLAY_FRAG, FULLSCREEN_VERT } from '../shaders';
import {
  bindQuad,
  createFullscreenQuad,
  createProgram,
  loadTextureFromUri,
} from '../gl/glHelpers';
import { quatToMat3 } from '../lib/quaternion';

interface Props {
  uri: string;
  style?: ViewStyle;
  fovDeg?: number;
}

const PITCH_LIMIT = (85 * Math.PI) / 180;

/**
 * Minimal interactive equirectangular viewer (drag to look around). Reuses the
 * display shader, sampling the loaded JPEG as an opaque sphere — a quick sanity
 * check that the panorama renders correctly before export, no SVG/three needed.
 */
export function PanoViewer({ uri, style, fovDeg = 75 }: Props) {
  const yaw = useRef(Math.PI); // start facing the panorama front (lon=0)
  const pitch = useRef(0);
  const start = useRef({ yaw: Math.PI, pitch: 0 });
  const rafRef = useRef<number | null>(null);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { yaw: yaw.current, pitch: pitch.current };
      },
      onPanResponderMove: (_e, g) => {
        yaw.current = start.current.yaw - g.dx * 0.005;
        pitch.current = Math.max(
          -PITCH_LIMIT,
          Math.min(PITCH_LIMIT, start.current.pitch + g.dy * 0.005),
        );
      },
    }),
  ).current;

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const program = createProgram(gl, FULLSCREEN_VERT, DISPLAY_FRAG);
      const quad = createFullscreenQuad(gl);
      const tex = await loadTextureFromUri(gl, uri);

      const dbW = gl.drawingBufferWidth;
      const dbH = gl.drawingBufferHeight;
      const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
      const tanU = tanV * (dbW / Math.max(1, dbH));

      const loop = () => {
        const q: Quat = quatMultiply(
          quatFromAxisAngle([0, 1, 0], yaw.current),
          quatFromAxisAngle([1, 0, 0], pitch.current),
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, dbW, dbH);
        gl.disable(gl.BLEND);
        gl.useProgram(program);
        bindQuad(gl, program, quad);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'uAccum'), 0);
        gl.uniformMatrix3fv(
          gl.getUniformLocation(program, 'uRot'),
          false,
          quatToMat3(q),
        );
        gl.uniform1f(gl.getUniformLocation(program, 'uTanU'), tanU);
        gl.uniform1f(gl.getUniformLocation(program, 'uTanV'), tanV);
        gl.uniform1f(gl.getUniformLocation(program, 'uMinWeight'), 0);
        gl.uniform1f(gl.getUniformLocation(program, 'uDim'), 0);
        gl.uniform3f(gl.getUniformLocation(program, 'uFill'), 0, 0, 0);
        gl.uniform1f(gl.getUniformLocation(program, 'uGrid'), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.endFrameEXP();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    },
    [uri, fovDeg],
  );

  return (
    <View style={[styles.wrap, style]} {...pan.panHandlers}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#000' },
});
