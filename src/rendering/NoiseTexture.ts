import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { RENDER } from '../config';
import { fbm } from '../core/math';

const SIZE = 256;
const LATTICE = 16;

/** Tileable RGBA noise (four independent channels) shared by the terrain, water and sky shaders. */
export function createNoiseTexture(): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * LATTICE;
      const v = (y / SIZE) * LATTICE;
      const i = (y * SIZE + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        data[i + channel] = Math.floor(fbm(u, v, 3, 101 + channel * 53, LATTICE) * 255);
      }
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = RENDER.maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}
