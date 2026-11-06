import { CanvasTexture, DoubleSide, FrontSide, MeshLambertMaterial, SRGBColorSpace, Uniform, type IUniform, type Material } from 'three';
import { CAMERA } from '../config';

/** Elapsed-time uniform shared by everything that sways in the wind. */
export const sharedTime: IUniform<number> = new Uniform(0);

/** North limit of what is drawn. See CAMERA.horizon. */
export const sharedHorizonZ: IUniform<number> = new Uniform(CAMERA.horizon.valleyZ);

const HORIZON_PARS = /* glsl */ `
uniform float uHorizonZ;
float horizonScale(float z) {
  float scale = smoothstep(uHorizonZ - ${CAMERA.horizon.band.toFixed(2)}, uHorizonZ, z);
  // Seen from the valley, nothing past its own treeline shows at all, not even partly grown.
  if (z < ${CAMERA.horizon.valleyTreelineZ.toFixed(2)}) scale *= smoothstep(0.0, 1.5, ${CAMERA.horizon.valleyZ.toFixed(2)} - uHorizonZ);
  return scale;
}`;

/**
 * Shrinks an object to nothing as it passes the horizon, around its own base. Whole
 * objects go, so nothing is ever cut in half, and the shader does it, so there is no
 * per-frame CPU cost. Instanced meshes use their instance position; merged geometry
 * needs an aBase attribute giving each vertex the base of the object it belongs to.
 */
export function applyHorizon(material: Material, key: string, source: 'instance' | 'attribute'): void {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uHorizonZ = sharedHorizonZ;
    const pars = source === 'attribute' ? `attribute vec3 aBase;${HORIZON_PARS}` : HORIZON_PARS;
    const apply = source === 'attribute'
      ? 'transformed = mix(aBase, transformed, horizonScale(aBase.z));'
      : `#ifdef USE_INSTANCING
           transformed *= horizonScale(instanceMatrix[3].z);
         #endif`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${pars}`)
      .replace('#include <project_vertex>', `${apply}
#include <project_vertex>`);
  };
  material.customProgramCacheKey = () => `horizon-${key}`;
}

/**
 * Vertex-colored Lambert material for instanced foliage, with GPU wind sway.
 * Displacement grows with height and is phased by instance position, so nothing
 * has to be updated on the CPU. The shadow pass stays static, which is not
 * noticeable at this amplitude and keeps that pass simple.
 */
export function createFoliageMaterial(swayPerHeightSq: number, doubleSided = false): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true, side: doubleSided ? DoubleSide : FrontSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 swayPhase = instanceMatrix[3].xz;
          float sway = sin(uTime * 1.3 + swayPhase.x * 0.31 + swayPhase.y * 0.23)
                     + 0.45 * sin(uTime * 2.9 + swayPhase.x * 0.83);
          float swayWeight = position.y * position.y * ${swayPerHeightSq.toFixed(5)};
          transformed.x += sway * swayWeight;
          transformed.z += sway * swayWeight * 0.4;
        #endif`,
      );
  };
  if (doubleSided) {
    // Thin blades share one light response on both faces, instead of the back going dark.
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n#ifndef FLAT_SHADED\nnormal = normalize(vNormal);\n#endif',
      );
    };
  }
  applyHorizon(material, `foliage-${swayPerHeightSq}-${doubleSided}`, 'instance');
  return material;
}

/** Soft radial sprite used for additive glows. */
export function createGlowTexture(size = 128): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
