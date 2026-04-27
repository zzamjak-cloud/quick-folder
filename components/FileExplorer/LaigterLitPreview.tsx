import React, { useEffect, useRef, useCallback, useState } from 'react';

const VS = `#version 300 es
layout(location=0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_diffuse;
uniform sampler2D u_normal;
uniform sampler2D u_specular;
uniform sampler2D u_occlusion;
uniform sampler2D u_parallax;
uniform bool u_parallax_on;
uniform float u_height_scale;
uniform vec3 u_l0_pos;
uniform vec3 u_l0_color;
uniform float u_l0_diff_i;
uniform float u_l0_spec_i;
uniform vec3 u_l0_spec_color;
uniform float u_l0_scatter;
uniform vec3 u_l1_pos;
uniform vec3 u_l1_color;
uniform float u_l1_diff_i;
uniform float u_l1_spec_i;
uniform vec3 u_l1_spec_color;
uniform float u_l1_scatter;
uniform int u_l1_enabled;
uniform vec3 u_ambient_color;
uniform float u_ambient_i;
uniform float u_normal_rot;
uniform bool u_toon;
uniform bool u_pixelated;
uniform vec2 u_pixel_cells;
out vec4 o_color;

vec2 parallax_uv(vec2 uv, vec3 viewDir) {
  float minLayers = 10.0;
  float maxLayers = 56.0;
  float numLayers = mix(maxLayers, minLayers, clamp(abs(viewDir.z), 0.001, 1.0));
  float layerDepth = 1.0 / numLayers;
  float currentLayerDepth = 0.0;
  vec2 P = viewDir.xy * u_height_scale;
  vec2 deltaTexCoords = P / numLayers;
  vec2 cur = uv;
  float dm = texture(u_parallax, cur).r;
  while (currentLayerDepth < dm) {
    cur += vec2(-deltaTexCoords.x, deltaTexCoords.y);
    dm = texture(u_parallax, cur).r;
    currentLayerDepth += layerDepth;
  }
  vec2 prev = cur - vec2(-deltaTexCoords.x, deltaTexCoords.y);
  float afterDepth = dm - currentLayerDepth;
  float beforeDepth = texture(u_parallax, prev).r - currentLayerDepth + layerDepth;
  float w = afterDepth / (afterDepth - beforeDepth + 1e-6);
  return mix(prev, cur, 1.0 - w);
}

mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

void apply_light(
  vec3 lightPos, vec3 lightColor, float diffI, float specI, vec3 specCol, float scatter,
  vec3 normal, vec3 viewDir, vec3 specMap, vec2 texCoords, inout vec3 acc
) {
  vec3 lightDir = normalize(vec3(lightPos.xy - texCoords, lightPos.z));
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), scatter);
  if (u_toon) spec = smoothstep(0.005, 0.02, spec);
  vec3 specular = specI * spec * specCol * specMap;
  float nl = max(dot(lightDir, normal), 0.0);
  if (u_toon) nl = smoothstep(0.48, 0.52, nl);
  vec3 diffuse = nl * lightColor * diffI;
  acc += diffuse + specular;
}

void main() {
  vec2 uv = v_uv;
  if (u_pixelated) {
    vec2 d = max(u_pixel_cells, vec2(2.0));
    vec2 c = uv * d;
    uv = (floor(c) / d + 0.5 / d);
  }
  vec3 viewDir = normalize(vec3((uv - 0.5) * 2.2, 1.35));
  vec2 texCoords = uv;
  if (u_parallax_on) {
    texCoords = parallax_uv(uv, viewDir);
    if (texCoords.x < 0.0 || texCoords.x > 1.0 || texCoords.y < 0.0 || texCoords.y > 1.0) discard;
  }
  vec4 tex = texture(u_diffuse, texCoords);
  vec3 nmap = texture(u_normal, texCoords).xyz * 2.0 - 1.0;
  vec3 normal = normalize(rotZ(u_normal_rot) * nmap);
  vec3 specMap = texture(u_specular, texCoords).xyz;
  float occlusion = texture(u_occlusion, texCoords).r;
  vec3 lit = vec3(0.0);
  apply_light(u_l0_pos, u_l0_color, u_l0_diff_i, u_l0_spec_i, u_l0_spec_color, u_l0_scatter,
    normal, viewDir, specMap, texCoords, lit);
  if (u_l1_enabled != 0) {
    apply_light(u_l1_pos, u_l1_color, u_l1_diff_i, u_l1_spec_i, u_l1_spec_color, u_l1_scatter,
      normal, viewDir, specMap, texCoords, lit);
  }
  vec3 ambient = u_ambient_color * u_ambient_i * occlusion;
  o_color = vec4(tex.rgb * (lit + ambient), tex.a);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

export interface LaigterLitPreviewTextures {
  diffuse: string;
  normal: string;
  parallax: string;
  specular: string;
  occlusion: string;
}

export type PreviewDisplayMode = 'fit' | 'actual';

export interface LaigterLitPreviewProps {
  textures: LaigterLitPreviewTextures | null;
  /** 미리보기 텍스처 픽셀 비율 (가로/세로). 지정 시 영역 안에 맞추되 원본 비율 유지 */
  textureWidth?: number;
  textureHeight?: number;
  /** fit: 패널에 맞춤, actual: 미리보기 텍스처 1픽셀=1CSS px (스크롤) */
  displayMode?: PreviewDisplayMode;
  themeVars: { border?: string; surface?: string } | null;
  parallaxEnabled: boolean;
  heightScale: number;
  ambientIntensity: number;
  ambientColor: [number, number, number];
  normalRotationDeg: number;
  toonShading: boolean;
  pixelated: boolean;
  pixelCells: number;
  light0: { x: number; y: number; z: number; diff: number; spec: number; scatter: number; color: [number, number, number]; specColor: [number, number, number] };
  light1Enabled: boolean;
  light1: { x: number; y: number; z: number; diff: number; spec: number; scatter: number; color: [number, number, number]; specColor: [number, number, number] };
}

function loadTex(gl: WebGL2RenderingContext, base64: string): Promise<WebGLTexture | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const t = gl.createTexture();
      if (!t) { resolve(null); return; }
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      resolve(t);
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${base64}`;
  });
}

export default function LaigterLitPreview({
  textures,
  textureWidth,
  textureHeight,
  displayMode = 'fit',
  themeVars,
  parallaxEnabled,
  heightScale,
  ambientIntensity,
  ambientColor,
  normalRotationDeg,
  toonShading,
  pixelated,
  pixelCells,
  light0,
  light1Enabled,
  light1,
}: LaigterLitPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayPx, setDisplayPx] = useState<{ w: number; h: number }>({ w: 320, h: 240 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<Partial<Record<string, WebGLTexture | null>>>({});
  const locRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const vboRef = useRef<WebGLBuffer | null>(null);
  const attribLocRef = useRef<number>(-1);

  const initGl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    glRef.current = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = linkProgram(gl, vs, fs);
    if (!prog) return;
    progRef.current = prog;
    const names = [
      'u_diffuse', 'u_normal', 'u_specular', 'u_occlusion', 'u_parallax',
      'u_parallax_on', 'u_height_scale', 'u_l0_pos', 'u_l0_color', 'u_l0_diff_i', 'u_l0_spec_i',
      'u_l0_spec_color', 'u_l0_scatter', 'u_l1_pos', 'u_l1_color', 'u_l1_diff_i', 'u_l1_spec_i',
      'u_l1_spec_color', 'u_l1_scatter', 'u_l1_enabled', 'u_ambient_color', 'u_ambient_i',
      'u_normal_rot', 'u_toon', 'u_pixelated', 'u_pixel_cells',
    ] as const;
    const loc: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) {
      loc[n] = gl.getUniformLocation(prog, n);
    }
    locRef.current = loc;

    const buf = gl.createBuffer();
    vboRef.current = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const locA = gl.getAttribLocation(prog, 'a_position');
    attribLocRef.current = locA;
    gl.enableVertexAttribArray(locA);
    gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);
  }, []);

  useEffect(() => {
    initGl();
    return () => {
      const gl = glRef.current;
      if (!gl) return;
      Object.values(texRef.current).forEach(t => { if (t) gl.deleteTexture(t); });
      if (progRef.current) gl.deleteProgram(progRef.current);
      if (vboRef.current) gl.deleteBuffer(vboRef.current);
      vboRef.current = null;
      glRef.current = null;
      progRef.current = null;
    };
  }, [initGl]);

  const drawRef = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;
    const { diffuse, normal, parallax, specular, occlusion } = texRef.current;
    if (!diffuse || !normal || !parallax || !specular || !occlusion) return;

    const vbo = vboRef.current;
    const aloc = attribLocRef.current;
    if (vbo && aloc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(aloc);
      gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.06, 0.07, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);

    const bind = (unit: number, tex: WebGLTexture, locName: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const loc = locRef.current[locName];
      if (loc) gl.uniform1i(loc, unit);
    };
    bind(0, diffuse, 'u_diffuse');
    bind(1, normal, 'u_normal');
    bind(2, specular, 'u_specular');
    bind(3, occlusion, 'u_occlusion');
    bind(4, parallax, 'u_parallax');

    const L = locRef.current;
    gl.uniform1i(L.u_parallax_on, parallaxEnabled ? 1 : 0);
    gl.uniform1f(L.u_height_scale, heightScale);
    gl.uniform3f(L.u_l0_pos, light0.x, light0.y, light0.z);
    gl.uniform3f(L.u_l0_color, light0.color[0], light0.color[1], light0.color[2]);
    gl.uniform1f(L.u_l0_diff_i, light0.diff);
    gl.uniform1f(L.u_l0_spec_i, light0.spec);
    gl.uniform3f(L.u_l0_spec_color, light0.specColor[0], light0.specColor[1], light0.specColor[2]);
    gl.uniform1f(L.u_l0_scatter, light0.scatter);
    gl.uniform3f(L.u_l1_pos, light1.x, light1.y, light1.z);
    gl.uniform3f(L.u_l1_color, light1.color[0], light1.color[1], light1.color[2]);
    gl.uniform1f(L.u_l1_diff_i, light1.diff);
    gl.uniform1f(L.u_l1_spec_i, light1.spec);
    gl.uniform3f(L.u_l1_spec_color, light1.specColor[0], light1.specColor[1], light1.specColor[2]);
    gl.uniform1f(L.u_l1_scatter, light1.scatter);
    gl.uniform1i(L.u_l1_enabled, light1Enabled ? 1 : 0);
    gl.uniform3f(L.u_ambient_color, ambientColor[0], ambientColor[1], ambientColor[2]);
    gl.uniform1f(L.u_ambient_i, ambientIntensity);
    gl.uniform1f(L.u_normal_rot, (normalRotationDeg * Math.PI) / 180);
    gl.uniform1i(L.u_toon, toonShading ? 1 : 0);
    gl.uniform1i(L.u_pixelated, pixelated ? 1 : 0);
    const ar = w / Math.max(h, 1);
    const cellsX = pixelCells * ar;
    const cellsY = pixelCells;
    gl.uniform2f(L.u_pixel_cells, Math.max(2, cellsX), Math.max(2, cellsY));

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [
    parallaxEnabled, heightScale, ambientIntensity, ambientColor, normalRotationDeg,
    toonShading, pixelated, pixelCells, light0, light1Enabled, light1,
  ]);

  drawRef.current = draw;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gl = glRef.current;
      const prog = progRef.current;
      if (!gl || !prog || !textures) return;
      Object.values(texRef.current).forEach(t => { if (t) gl.deleteTexture(t); });
      texRef.current = {};
      const keys = ['diffuse', 'normal', 'parallax', 'specular', 'occlusion'] as const;
      for (const k of keys) {
        if (cancelled) return;
        const t = await loadTex(gl, textures[k]);
        texRef.current[k] = t;
      }
      if (cancelled) return;
      drawRef.current();
    })();
    return () => { cancelled = true; };
  }, [textures]);

  useEffect(() => {
    draw();
  }, [draw, textures]);

  /** 표시 크기: fit=contain, actual=텍스처 픽셀 1:1 */
  useEffect(() => {
    const outer = containerRef.current;
    if (!outer) return;
    const measure = () => {
      const pw = outer.clientWidth;
      const ph = outer.clientHeight;
      if (pw < 2 || ph < 2) return;
      const tw = textureWidth;
      const th = textureHeight;
      if (displayMode === 'actual' && tw && th && tw > 0 && th > 0) {
        setDisplayPx({ w: Math.max(2, Math.floor(tw)), h: Math.max(2, Math.floor(th)) });
        return;
      }
      if (tw && th && tw > 0 && th > 0) {
        const ar = tw / th;
        let dw = pw;
        let dh = ph;
        if (pw / ph > ar) {
          dw = ph * ar;
        } else {
          dh = pw / ar;
        }
        setDisplayPx({ w: Math.max(2, Math.floor(dw)), h: Math.max(2, Math.floor(dh)) });
      } else {
        setDisplayPx({ w: Math.max(2, Math.floor(pw)), h: Math.max(2, Math.floor(ph)) });
      }
    };
    measure();
    const ro = new ResizeObserver(() => {
      measure();
      requestAnimationFrame(() => drawRef.current());
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, [textureWidth, textureHeight, displayMode]);

  useEffect(() => {
    requestAnimationFrame(() => draw());
  }, [displayPx, draw]);

  const alignFit = displayMode === 'fit';

  return (
    <div
      ref={containerRef}
      className={
        alignFit
          ? 'flex h-full min-h-[120px] w-full items-center justify-center'
          : 'shrink-0'
      }
    >
      <div
        className="shrink-0 rounded-md"
        style={{
          width: displayPx.w,
          height: displayPx.h,
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          background: themeVars?.surface ?? '#0f172a',
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full rounded-[inherit]" />
      </div>
    </div>
  );
}
