import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  LoadingManager,
  Material,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { createModelUrlModifier, getDirName } from './modelPreviewPaths';

export interface ModelPreviewSceneHandle {
  resetCamera: () => void;
}

interface ModelPreviewSceneProps {
  path: string;
  accentColor: string;
  mutedColor: string;
  wireframe: boolean;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function parseFbx(buffer: ArrayBuffer, resourcePath: string, manager: LoadingManager): Group {
  const loader = new FBXLoader(manager);
  loader.setResourcePath(resourcePath);
  return loader.parse(buffer, resourcePath) as Group;
}

// OBJ는 .mtl(머티리얼)이 별도 파일이므로 mtllib 선언을 먼저 읽어 함께 로드한다.
// .mtl이 없거나 로드에 실패하면 OBJLoader 기본 머티리얼로 계속 진행한다.
async function parseObj(
  text: string,
  resourcePath: string,
  manager: LoadingManager,
): Promise<Group> {
  const loader = new OBJLoader(manager);
  loader.setResourcePath(resourcePath);

  const mtlName = text.match(/^\s*mtllib\s+(.+?)\s*$/m)?.[1];
  if (mtlName) {
    try {
      const mtlResponse = await fetch(`${resourcePath}${encodeURIComponent(mtlName)}`);
      if (mtlResponse.ok || mtlResponse.status === 0) {
        const mtlLoader = new MTLLoader(manager);
        mtlLoader.setResourcePath(resourcePath);
        const materials = mtlLoader.parse(await mtlResponse.text(), resourcePath);
        materials.preload();
        loader.setMaterials(materials);
      }
    } catch (err) {
      console.warn('MTL 로드 실패 (기본 머티리얼로 진행):', err);
    }
  }

  const group = loader.parse(text);
  // OBJ에 법선(vn)이 없으면 조명 계산이 되지 않아 검게 보이므로 직접 계산한다
  group.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    if (!obj.geometry?.getAttribute('normal')) obj.geometry?.computeVertexNormals();
  });
  return group;
}

function applyWireframe(scene: Scene, wireframe: boolean) {
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((mat: Material & { wireframe?: boolean }) => {
      if ('wireframe' in mat) mat.wireframe = wireframe;
    });
  });
}

const ModelPreviewScene = forwardRef<ModelPreviewSceneHandle, ModelPreviewSceneProps>(
  function ModelPreviewScene({ path, accentColor, mutedColor, wireframe }, ref) {
    const isObjModel = /\.obj$/i.test(path);
    const modelLabel = isObjModel ? 'OBJ' : 'FBX';
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const initialCameraPos = useRef<Vector3 | null>(null);
    const initialTargetPos = useRef<Vector3 | null>(null);
    const wireframeRef = useRef(wireframe);

    const [loading, setLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const resetCamera = useCallback(() => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls || !initialCameraPos.current || !initialTargetPos.current) return;

      camera.position.copy(initialCameraPos.current);
      controls.target.copy(initialTargetPos.current);
      controls.update();
    }, []);

    useImperativeHandle(ref, () => ({ resetCamera }), [resetCamera]);

    useEffect(() => {
      wireframeRef.current = wireframe;
      const scene = sceneRef.current;
      if (!scene) return;

      applyWireframe(scene, wireframe);
    }, [wireframe]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let disposed = false;
      let cleanupScene: (() => void) | null = null;

      setLoading(true);
      setLoadProgress(0);
      setError(null);

      try {
        initialCameraPos.current = new Vector3();
        initialTargetPos.current = new Vector3();

        const scene = new Scene();
        scene.background = new Color(0x1a1a2e);
        sceneRef.current = scene;

        const width = container.clientWidth;
        const height = container.clientHeight;
        const camera = new PerspectiveCamera(50, width / height, 0.01, 10000);
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        const renderer = new WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFShadowMap;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.enablePan = true;
        controlsRef.current = controls;

        const ambientLight = new AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const hemiLight = new HemisphereLight(0x8888ff, 0x443322, 0.4);
        scene.add(hemiLight);

        const gridHelper = new GridHelper(20, 20, 0x444466, 0x333355);
        scene.add(gridHelper);

        const loadingManager = new LoadingManager();
        loadingManager.setURLModifier(createModelUrlModifier(path, convertFileSrc));
        loadingManager.onError = (url) => {
          console.warn('텍스처 로드 실패 (무시):', url);
        };
        const parentDir = getDirName(path);
        const resourcePath = `${convertFileSrc(parentDir)}/`;

        const loadModel = async () => {
          try {
            const response = await fetch(convertFileSrc(path));
            if (!response.ok && response.status !== 0) {
              throw new Error(`HTTP ${response.status}`);
            }

            const model = isObjModel
              ? await parseObj(await response.text(), resourcePath, loadingManager)
              : parseFbx(await response.arrayBuffer(), resourcePath, loadingManager);
            if (disposed) return;

            const box = new Box3().setFromObject(model);
            const center = box.getCenter(new Vector3());
            const size = box.getSize(new Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;

            model.position.sub(center);
            gridHelper.position.y = -size.y / 2;

            const distance = maxDim * 2.5;
            camera.position.set(distance * 0.8, distance * 0.5, distance);
            camera.near = maxDim * 0.001;
            camera.far = maxDim * 100;
            camera.updateProjectionMatrix();
            controls.target.set(0, 0, 0);
            controls.update();

            initialCameraPos.current?.copy(camera.position);
            initialTargetPos.current?.copy(controls.target);
            dirLight.position.copy(camera.position).normalize().multiplyScalar(distance);

            scene.add(model);
            applyWireframe(scene, wireframeRef.current);
            setLoading(false);
            setLoadProgress(100);
          } catch (err) {
            if (disposed) return;
            console.error('모델 로드 오류:', err);
            // 원인 파악을 위해 실제 오류 메시지를 함께 노출한다
            // (미지원 FBX 버전, 파일 접근 실패 등은 메시지가 없으면 구분이 불가능)
            setError(`${modelLabel} 파일을 불러오는 데 실패했습니다.\n${describeError(err)}`);
            setLoading(false);
          }
        };
        void loadModel();

        const animate = () => {
          animFrameRef.current = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
          if (!container) return;
          const w = container.clientWidth;
          const h = container.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        cleanupScene = () => {
          window.removeEventListener('resize', handleResize);

          if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
          }

          controls.dispose();
          scene.traverse((obj) => {
            if (!(obj instanceof Mesh)) return;
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => mat.dispose());
            } else {
              obj.material?.dispose();
            }
          });

          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }

          sceneRef.current = null;
          cameraRef.current = null;
          controlsRef.current = null;
          rendererRef.current = null;
          initialCameraPos.current = null;
          initialTargetPos.current = null;
        };
      } catch (err) {
        if (!disposed) {
          console.error('3D 뷰어 초기화 오류:', err);
          setError(`3D 뷰어를 초기화하지 못했습니다.\n${describeError(err)}`);
          setLoading(false);
        }
      }

      return () => {
        disposed = true;
        cleanupScene?.();
      };
    }, [path]);

    return (
      <div className="flex-1 min-h-0 relative" onClick={e => e.stopPropagation()}>
        <div ref={containerRef} className="w-full h-full" />

        {loading && !error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ backgroundColor: 'rgba(26, 26, 46, 0.85)' }}
          >
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: `${accentColor} transparent transparent transparent`,
              }}
            />
            <span style={{ color: mutedColor, fontSize: 13 }}>
              {modelLabel} 로딩 중... {loadProgress > 0 ? `${loadProgress}%` : ''}
            </span>
          </div>
        )}

        {error && (
          <div
            className="absolute inset-0 flex items-center justify-center px-6"
            style={{ backgroundColor: 'rgba(26, 26, 46, 0.9)' }}
          >
            <span
              style={{
                color: '#f87171',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </span>
          </div>
        )}
      </div>
    );
  },
);

export default ModelPreviewScene;
