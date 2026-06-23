declare module 'jpeg-js' {
  export interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export interface DecodeOptions {
    useTArray?: boolean;
    formatAsRGBA?: boolean;
    maxResolutionInMP?: number;
    maxMemoryUsageInMB?: number;
  }
  export function decode(
    data: Uint8Array | ArrayBuffer,
    opts?: DecodeOptions,
  ): RawImageData;
  export function encode(
    img: { data: Uint8Array; width: number; height: number },
    quality?: number,
  ): { data: Uint8Array; width: number; height: number };
}
