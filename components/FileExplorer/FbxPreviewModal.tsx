import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';

interface FbxPreviewModalProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
}

/**
 * FBX 3D 파일 미리보기 모달.
 * Three.js + FBXLoader 기반으로 3D 모델을 렌더링한다.
 * 마우스 드래그 회전, 휠 줌, 우클릭 패닝을 지원한다.
 */
export default function FbxPreviewModal({ path, themeVars, onClose }: FbxPreviewModalProps) {
  const fileName = getFileName(path);

  // Three.js 씬이 마운트될 컨테이너 ref
  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js 핵심 객체 ref (렌더 루프에서 직접 접근하므로 ref 사용)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  // 카메라 초기 상태 저장 (리셋용)
  const initialCameraPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const initialTargetPos = useRef<THREE.Vector3>(new THREE.Vector3());

  // UI 상태
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);

  // 공통 색상
  const surface2 = themeVars?.surface2 ?? '#1e293b';
  const border = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const accentColor = themeVars?.accent ?? '#3b82f6';

  // 툴바 버튼 공통 스타일
  const toolbarBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: mutedColor,
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 12,
  };

  /**
   * 와이어프레임 모드 토글.
   * 씬 내 모든 Mesh의 material을 순회하여 wireframe 속성을 변경한다.
   */
  const toggleWireframe = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const next = !wireframe;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial ||
                mat instanceof THREE.MeshPhongMaterial ||
                mat instanceof THREE.MeshLambertMaterial ||
                mat instanceof THREE.MeshBasicMaterial) {
              mat.wireframe = next;
            }
          });
        } else {
          const mat = obj.material as THREE.Material & { wireframe?: boolean };
          if ('wireframe' in mat) mat.wireframe = next;
        }
      }
    });
    setWireframe(next);
  }, [wireframe]);

  /**
   * 카메라를 초기 위치로 리셋한다.
   */
  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.position.copy(initialCameraPos.current);
    controls.target.copy(initialTargetPos.current);
    controls.update();
  }, []);

  /**
   * Three.js 씬을 초기화하고 FBX 파일을 로드한다.
   * 컨테이너가 마운트된 후 실행된다.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── 씬 생성 ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // ── 카메라 생성 ──────────────────────────────────────────
    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 10000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // ── 렌더러 생성 ──────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── OrbitControls ────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = true;
    controlsRef.current = controls;

    // ── 조명 설정 ────────────────────────────────────────────
    // 전체 균일 환경광
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // 주 방향광 (카메라 위에서 비춤)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 하늘/바닥 반구광 (분위기 보정)
    const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x443322, 0.4);
    scene.add(hemiLight);

    // ── 바닥 그리드 ──────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355);
    scene.add(gridHelper);

    // ── FBX 로드 ─────────────────────────────────────────────
    // 텍스처 로드 실패(PSD, TGA 등 웹 미지원 포맷) 시 에러 억제
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = (url) => {
      console.warn('텍스처 로드 실패 (무시):', url);
    };
    const loader = new FBXLoader(loadingManager);

    // 부모 디렉토리 경로에서 OS 구분자(/ 또는 \) 처리
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    const parentDir = lastSlash >= 0 ? path.substring(0, lastSlash) : path;
    const resourceBase = convertFileSrc(parentDir) + '/';
    loader.setResourcePath(resourceBase);

    const fileUrl = convertFileSrc(path);

    loader.load(
      fileUrl,
      // onLoad: 모델 로드 완료
      (fbx: THREE.Group) => {
        modelRef.current = fbx;

        // 바운딩박스 계산으로 모델 크기 파악
        const box = new THREE.Box3().setFromObject(fbx);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // 모델을 중앙으로 이동
        fbx.position.sub(center);

        // 그리드를 모델 하단에 배치
        const yOffset = -size.y / 2;
        gridHelper.position.y = yOffset;

        // 카메라를 모델 크기의 2.5배 거리에 배치
        const distance = maxDim * 2.5;
        camera.position.set(distance * 0.8, distance * 0.5, distance);
        camera.near = maxDim * 0.001;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        // 초기 위치 저장 (리셋용)
        initialCameraPos.current.copy(camera.position);
        initialTargetPos.current.copy(controls.target);

        // 방향광을 카메라 위치와 동기화
        dirLight.position.copy(camera.position).normalize().multiplyScalar(distance);

        scene.add(fbx);
        setLoading(false);
      },
      // onProgress: 로드 진행률
      (xhr: ProgressEvent) => {
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadProgress(pct);
        }
      },
      // onError: 로드 오류
      (err: unknown) => {
        console.error('FBX 로드 오류:', err);
        setError('FBX 파일을 불러오는 데 실패했습니다.');
        setLoading(false);
      }
    );

    // ── 렌더 루프 ────────────────────────────────────────────
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── 리사이즈 핸들러 ──────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── 정리 (cleanup) ────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', handleResize);

      // 렌더 루프 중지
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // OrbitControls 해제
      controls.dispose();

      // 씬 내 모든 geometry, material 해제 (메모리 누수 방지)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            (obj.material as THREE.Material)?.dispose();
          }
        }
      });

      // 렌더러 해제 및 DOM에서 제거
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // ── ESC 키로 모달 닫기 ───────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      {/* 헤더: 파일명 + 닫기 버튼 */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ backgroundColor: surface2, borderBottom: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm font-medium truncate" style={{ color: textColor }}>
          {fileName}
        </span>
        <button style={{ ...toolbarBtn, fontSize: 18 }} onClick={onClose}>
          ✕
        </button>
      </div>

      {/* 툴바: 카메라 리셋 + 와이어프레임 토글 */}
      <div
        className="flex items-center gap-2 px-4 py-1 shrink-0"
        style={{ backgroundColor: surface2, borderBottom: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <button
          style={toolbarBtn}
          onClick={resetCamera}
          title="카메라를 초기 위치로 복귀"
        >
          ↺ 카메라 리셋
        </button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 16, backgroundColor: border }} />

        <button
          style={{
            ...toolbarBtn,
            color: wireframe ? accentColor : mutedColor,
            fontWeight: wireframe ? 600 : 400,
          }}
          onClick={toggleWireframe}
          title="와이어프레임 모드 토글"
        >
          ⬡ 와이어프레임
        </button>
      </div>

      {/* 3D 뷰어 영역 */}
      <div
        className="flex-1 min-h-0 relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Three.js 렌더 타겟 컨테이너 */}
        <div ref={containerRef} className="w-full h-full" />

        {/* 로딩 오버레이 */}
        {loading && !error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ backgroundColor: 'rgba(26, 26, 46, 0.85)' }}
          >
            {/* 스피너 */}
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: `${accentColor} transparent transparent transparent`,
              }}
            />
            <span style={{ color: mutedColor, fontSize: 13 }}>
              FBX 로딩 중... {loadProgress > 0 ? `${loadProgress}%` : ''}
            </span>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(26, 26, 46, 0.9)' }}
          >
            <span style={{ color: '#f87171', fontSize: 14 }}>{error}</span>
          </div>
        )}
      </div>

      {/* 하단 상태바: 조작 안내 */}
      <div
        className="flex items-center justify-center px-4 py-1 shrink-0"
        style={{ backgroundColor: surface2, borderTop: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{ color: mutedColor, fontSize: 11 }}>
          드래그: 회전 &nbsp;|&nbsp; 스크롤: 확대/축소 &nbsp;|&nbsp; 우클릭 드래그: 이동
        </span>
      </div>
    </div>
  );
}
