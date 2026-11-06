import { NoToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import { RENDER } from '../config';

/** Owns the WebGL context, canvas sizing and context-loss handling. */
export class RendererHost {
  readonly renderer: WebGLRenderer;
  private readonly observer: ResizeObserver;
  private contextLost = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly onResize: (width: number, height: number) => void,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: RENDER.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    // Colors are art-directed directly, and tone mapping would break the match between sky and fog.
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.observer = new ResizeObserver(() => this.applySize());
    this.observer.observe(container);
    this.applySize();
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  dispose(): void {
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.dispose();
    canvas.remove();
  }

  private applySize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.onResize(width, height);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
  };
}
