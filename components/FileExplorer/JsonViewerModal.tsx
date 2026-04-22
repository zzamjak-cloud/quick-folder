import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Search, Maximize2, Minimize2, Edit3, Save, Plus, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { getBaseName } from '../../utils/pathUtils';

interface JsonViewerModalProps {
  path: string;
  data: any;
  onClose: () => void;
  themeVars: ThemeVars | null;
  /**
   * 편집 모드 요청 토큰 — 값이 0보다 크면 편집 모드로 진입하고,
   * 값이 변경될 때마다 (Enter 재진입 등) 편집 모드로 다시 전환됨
   */
  editRequestToken?: number;
}

type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/**
 * JSON 뷰어 모달
 * - 폴딩/펼치기 기능 (전체 펼치기/접기 버튼)
 * - 타입 표시 On/Off
 * - 검색 기능 (키·값 검색)
 */
export default function JsonViewerModal({ path, data, onClose, themeVars, editRequestToken = 0 }: JsonViewerModalProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
  const [showTypes, setShowTypes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(editRequestToken > 0);
  const [editedData, setEditedData] = useState<any>(data);
  const [saving, setSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 편집 요청 토큰이 증가할 때마다 편집 모드 재진입 (Enter 재입력 등)
  useEffect(() => {
    if (editRequestToken > 0) setEditMode(true);
  }, [editRequestToken]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const togglePath = (jsonPath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(jsonPath)) next.delete(jsonPath);
      else next.add(jsonPath);
      return next;
    });
  };

  const expandAll = () => {
    const allPaths = new Set<string>();
    const traverse = (obj: any, path: string) => {
      allPaths.add(path);
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          traverse(obj[key], `${path}.${key}`);
        });
      }
    };
    traverse(data, 'root');
    setExpandedPaths(allPaths);
  };

  const collapseAll = () => {
    setExpandedPaths(new Set(['root']));
  };

  // JSON 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      const jsonString = JSON.stringify(editedData, null, 2);
      await invoke('write_text_file', { path, content: jsonString });
      setEditMode(false);
      setSaving(false);
    } catch (e) {
      console.error('JSON 저장 실패:', e);
      setSaving(false);
      alert('JSON 저장에 실패했습니다.');
    }
  };

  // 값 수정
  const handleValueChange = (jsonPath: string, newValue: any) => {
    const pathParts = jsonPath.split('.').slice(1); // 'root' 제거
    const newData = JSON.parse(JSON.stringify(editedData));

    let current = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
    }

    const lastKey = pathParts[pathParts.length - 1];
    current[lastKey] = newValue;

    setEditedData(newData);
  };

  // 특정 위치 바로 뒤에 빈 키/값 삽입
  // jsonPath: 삽입 기준 항목의 경로 (이 항목 바로 뒤에 새 항목이 추가됨)
  const handleInsertAfter = (jsonPath: string) => {
    const pathParts = jsonPath.split('.').slice(1); // 'root' 제거
    if (pathParts.length === 0) return;
    const newData = JSON.parse(JSON.stringify(editedData));

    // 부모 객체 찾기
    let parent = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      parent = parent[pathParts[i]];
    }
    const lastKey = pathParts[pathParts.length - 1];

    if (Array.isArray(parent)) {
      const idx = parseInt(lastKey, 10);
      if (Number.isNaN(idx)) return;
      parent.splice(idx + 1, 0, '');
    } else if (parent && typeof parent === 'object') {
      // 객체: 기준 키 바로 뒤에 빈 키 삽입. key 순서 보존을 위해 재구성
      const entries = Object.entries(parent);
      const insertIdx = entries.findIndex(([k]) => k === lastKey);
      if (insertIdx < 0) return;
      const newKey = generateUniqueKey(parent, 'newKey');
      entries.splice(insertIdx + 1, 0, [newKey, '']);
      // 기존 키 삭제 후 순서대로 재삽입
      for (const k of Object.keys(parent)) delete parent[k];
      for (const [k, v] of entries) parent[k] = v;
    }
    setEditedData(newData);
  };

  // 컨테이너 맨 앞에 빈 항목 삽입 (객체/배열의 첫 추가용)
  const handleInsertFirst = (containerPath: string) => {
    const pathParts = containerPath.split('.').slice(1); // 'root' 제거
    const newData = JSON.parse(JSON.stringify(editedData));

    // containerPath가 'root'이면 newData 자체
    let container: any = newData;
    for (let i = 0; i < pathParts.length; i++) {
      container = container[pathParts[i]];
    }

    if (Array.isArray(container)) {
      container.unshift('');
    } else if (container && typeof container === 'object') {
      // 객체: 'newKey' 부터 순서 유지하여 맨 앞에 삽입
      const entries = Object.entries(container);
      const newKey = generateUniqueKey(container, 'newKey');
      const rebuilt: [string, any][] = [[newKey, ''], ...entries];
      for (const k of Object.keys(container)) delete container[k];
      for (const [k, v] of rebuilt) container[k] = v;
    } else {
      return;
    }

    // 부모를 갱신해야 하는 경우 (root가 아닌 경우)
    if (pathParts.length === 0) {
      setEditedData(container);
    } else {
      setEditedData(newData);
    }
    // 삽입된 컨테이너는 자동 펼침
    setExpandedPaths(prev => new Set(prev).add(containerPath));
  };

  // 중복 없는 기본 키 생성 (newKey, newKey2, newKey3, ...)
  const generateUniqueKey = (obj: any, base: string): string => {
    if (!(base in obj)) return base;
    let i = 2;
    while (`${base}${i}` in obj) i++;
    return `${base}${i}`;
  };

  // 키/요소 삭제
  const handleDeleteKey = (jsonPath: string) => {
    const pathParts = jsonPath.split('.').slice(1);
    if (pathParts.length === 0) return;
    const newData = JSON.parse(JSON.stringify(editedData));

    let parent = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      parent = parent[pathParts[i]];
    }
    const lastKey = pathParts[pathParts.length - 1];

    if (Array.isArray(parent)) {
      const idx = parseInt(lastKey, 10);
      if (Number.isNaN(idx)) return;
      parent.splice(idx, 1);
    } else if (parent && typeof parent === 'object') {
      delete parent[lastKey];
    }
    setEditedData(newData);
  };

  // 키 수정
  const handleKeyChange = (jsonPath: string, oldKey: string, newKey: string) => {
    if (!newKey.trim() || oldKey === newKey) return;

    const pathParts = jsonPath.split('.').slice(1, -1); // 'root' 제거, 마지막 키도 제거
    const newData = JSON.parse(JSON.stringify(editedData));

    // 부모 객체 찾기
    let parent = newData;
    for (let i = 0; i < pathParts.length; i++) {
      parent = parent[pathParts[i]];
    }

    // 새 키가 이미 존재하면 경고
    if (newKey in parent) {
      alert(`키 "${newKey}"가 이미 존재합니다.`);
      return;
    }

    // 키 이름 변경: 기존 키 값을 새 키로 복사하고 기존 키 삭제
    const value = parent[oldKey];
    delete parent[oldKey];
    parent[newKey] = value;

    setEditedData(newData);
  };

  // 검색 필터링 (키 또는 값에 검색어 부분 일치)
  const matchesSearch = (key: string, value: any): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();

    // 키 검색 (부분 일치)
    if (key.toLowerCase().includes(q)) return true;

    // 값 검색 (부분 일치)
    if (value === null) {
      return 'null'.includes(q);
    }
    if (typeof value === 'string') {
      return value.toLowerCase().includes(q);
    }
    if (typeof value === 'number') {
      return value.toString().includes(q);
    }
    if (typeof value === 'boolean') {
      return value.toString().includes(q);
    }

    // 객체/배열의 경우 내부 재귀 검색
    if (typeof value === 'object') {
      return JSON.stringify(value).toLowerCase().includes(q);
    }

    return false;
  };

  const getNodeType = (value: any): NodeType => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value as NodeType;
  };

  const getTypeLabel = (type: NodeType): string => {
    const labels: Record<NodeType, string> = {
      object: 'Object',
      array: 'Array',
      string: 'String',
      number: 'Number',
      boolean: 'Boolean',
      null: 'Null',
    };
    return labels[type];
  };

  const getTypeColor = (type: NodeType): string => {
    const colors: Record<NodeType, string> = {
      object: themeVars?.accent ?? '#3b82f6',
      array: '#10b981',
      string: '#f59e0b',
      number: '#8b5cf6',
      boolean: '#ec4899',
      null: '#6b7280',
    };
    return colors[type];
  };

  const renderValue = (value: any, type: NodeType, jsonPath: string, isEditable: boolean): React.ReactNode => {
    const typeColor = getTypeColor(type);

    if (!isEditable) {
      if (type === 'string') return <span style={{ color: typeColor }}>"{value}"</span>;
      if (type === 'number') return <span style={{ color: typeColor }}>{value}</span>;
      if (type === 'boolean') return <span style={{ color: typeColor }}>{value.toString()}</span>;
      if (type === 'null') return <span style={{ color: typeColor }}>null</span>;
      return null;
    }

    // 편집 모드: 입력 필드 표시
    if (type === 'string') {
      return (
        <input
          type="text"
          className="px-1 py-0.5 text-xs rounded outline-none"
          style={{
            backgroundColor: themeVars?.surface ?? '#111827',
            color: typeColor,
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
            minWidth: '100px',
          }}
          value={value}
          onChange={(e) => handleValueChange(jsonPath, e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    if (type === 'number') {
      return (
        <input
          type="number"
          className="px-1 py-0.5 text-xs rounded outline-none"
          style={{
            backgroundColor: themeVars?.surface ?? '#111827',
            color: typeColor,
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
            width: '80px',
          }}
          value={value}
          onChange={(e) => handleValueChange(jsonPath, parseFloat(e.target.value) || 0)}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    if (type === 'boolean') {
      return (
        <select
          className="px-1 py-0.5 text-xs rounded outline-none cursor-pointer"
          style={{
            backgroundColor: themeVars?.surface ?? '#111827',
            color: typeColor,
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
          }}
          value={value.toString()}
          onChange={(e) => handleValueChange(jsonPath, e.target.value === 'true')}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    if (type === 'null') return <span style={{ color: typeColor }}>null</span>;
    return null;
  };

  const renderNode = (obj: any, jsonPath: string, depth: number): React.ReactNode[] => {
    if (!obj || typeof obj !== 'object') return [];
    const isExpanded = expandedPaths.has(jsonPath);
    const entries = Object.entries(obj);
    const nodes: React.ReactNode[] = [];

    entries.forEach(([key, value]) => {
      const childPath = `${jsonPath}.${key}`;
      const type = getNodeType(value);
      const isContainer = type === 'object' || type === 'array';
      const childExpanded = expandedPaths.has(childPath);

      // 검색 필터
      if (!matchesSearch(key, value)) return;

      nodes.push(
        <div key={childPath} style={{ marginLeft: depth * 16 }}>
          <div
            className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-opacity-50"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = themeVars?.surfaceHover ?? '#334155')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => isContainer && togglePath(childPath)}
          >
            {/* 폴딩 아이콘 */}
            {isContainer ? (
              childExpanded ? (
                <ChevronDown size={14} style={{ color: themeVars?.muted }} />
              ) : (
                <ChevronRight size={14} style={{ color: themeVars?.muted }} />
              )
            ) : (
              <span style={{ width: 14, display: 'inline-block' }} />
            )}

            {/* 키 */}
            {editMode ? (
              <input
                type="text"
                className="px-1 py-0.5 text-xs rounded outline-none font-medium"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.text,
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                  minWidth: '60px',
                  maxWidth: '200px',
                }}
                defaultValue={key}
                onBlur={(e) => {
                  const newKey = e.target.value.trim();
                  if (newKey && newKey !== key) {
                    handleKeyChange(childPath, key, newKey);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-xs font-medium" style={{ color: themeVars?.text }}>
                {key}:
              </span>
            )}

            {/* 타입 표시 */}
            {showTypes && (
              <span
                className="text-[10px] px-1 rounded"
                style={{
                  backgroundColor: `${getTypeColor(type)}20`,
                  color: getTypeColor(type),
                }}
              >
                {getTypeLabel(type)}
              </span>
            )}

            {/* 값 (리프 노드만) */}
            {!isContainer && (
              <span className="text-xs ml-1" style={{ color: themeVars?.muted }}>
                {renderValue(value, type, childPath, editMode)}
              </span>
            )}

            {/* 컨테이너 요약 (접혀있을 때) */}
            {isContainer && !childExpanded && (
              <span className="text-xs ml-1" style={{ color: themeVars?.muted }}>
                {type === 'array' ? `[${Array.isArray(value) ? value.length : 0}]` : `{${Object.keys(value || {}).length}}`}
              </span>
            )}

            {/* 편집 모드: 항목별 삽입/삭제 버튼 */}
            {editMode && (
              <span className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  title="이 항목 다음에 추가"
                  className="p-0.5 rounded hover:opacity-80"
                  style={{
                    backgroundColor: `${themeVars?.accent ?? '#3b82f6'}25`,
                    color: themeVars?.accent ?? '#3b82f6',
                    border: `1px solid ${themeVars?.border ?? '#334155'}`,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => { e.stopPropagation(); handleInsertAfter(childPath); }}
                >
                  <Plus size={11} />
                </button>
                <button
                  title="이 항목 삭제"
                  className="p-0.5 rounded hover:opacity-80"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#f87171',
                    border: `1px solid ${themeVars?.border ?? '#334155'}`,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteKey(childPath); }}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </div>

          {/* 자식 노드 (펼쳐져 있을 때만) */}
          {isContainer && childExpanded && (
            <>
              {renderNode(value, childPath, depth + 1)}
              {/* 편집 모드이고 컨테이너가 비어있으면 첫 항목 추가 버튼 */}
              {editMode && value && typeof value === 'object' && Object.keys(value).length === 0 && (
                <div style={{ marginLeft: (depth + 1) * 16 }}>
                  <button
                    title={type === 'array' ? '첫 요소 추가' : '첫 키 추가'}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:opacity-80 mt-0.5"
                    style={{
                      backgroundColor: `${themeVars?.accent ?? '#3b82f6'}20`,
                      color: themeVars?.accent ?? '#3b82f6',
                      border: `1px dashed ${themeVars?.accent ?? '#3b82f6'}`,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => { e.stopPropagation(); handleInsertFirst(childPath); }}
                  >
                    <Plus size={10} />
                    {type === 'array' ? '요소 추가' : '키 추가'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      );
    });

    return nodes;
  };

  const fileName = getBaseName(path);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      data-json-preview="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1f2937',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: '70vw',
          maxWidth: '900px',
          height: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: themeVars?.border ?? '#334155' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: themeVars?.text }}>
              {fileName}
            </span>
            <span className="text-xs" style={{ color: themeVars?.muted }}>
              JSON 뷰어
            </span>
          </div>

          {/* 도구 버튼 */}
          <div className="flex items-center gap-2">
            {/* 검색 */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: themeVars?.muted }}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="검색..."
                className="pl-7 pr-2 py-1 text-xs rounded-md outline-none w-48"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.text,
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* 타입 표시 토글 */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: themeVars?.text }}>
              <input
                type="checkbox"
                checked={showTypes}
                onChange={e => setShowTypes(e.target.checked)}
                className="cursor-pointer"
              />
              타입 표시
            </label>

            {/* 전체 펼치기/접기 */}
            {!editMode && (
              <>
                <button
                  className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80 flex items-center gap-1"
                  style={{
                    backgroundColor: themeVars?.surface ?? '#111827',
                    color: themeVars?.text,
                    border: `1px solid ${themeVars?.border ?? '#334155'}`,
                  }}
                  onClick={expandAll}
                  title="전체 펼치기"
                >
                  <Maximize2 size={12} />
                  펼치기
                </button>
                <button
                  className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80 flex items-center gap-1"
                  style={{
                    backgroundColor: themeVars?.surface ?? '#111827',
                    color: themeVars?.text,
                    border: `1px solid ${themeVars?.border ?? '#334155'}`,
                  }}
                  onClick={collapseAll}
                  title="전체 접기"
                >
                  <Minimize2 size={12} />
                  접기
                </button>
              </>
            )}

            {/* 편집/저장 버튼 */}
            {!editMode ? (
              <button
                className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80 flex items-center gap-1"
                style={{
                  backgroundColor: themeVars?.accent ?? '#4ade80',
                  color: '#000',
                  fontWeight: 600,
                }}
                onClick={() => setEditMode(true)}
                title="편집 모드"
              >
                <Edit3 size={12} />
                편집
              </button>
            ) : (
              <>
                <button
                  className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80 flex items-center gap-1"
                  style={{
                    backgroundColor: themeVars?.surface ?? '#111827',
                    color: themeVars?.text,
                    border: `1px solid ${themeVars?.border ?? '#334155'}`,
                  }}
                  onClick={() => {
                    setEditMode(false);
                    setEditedData(data); // 변경사항 취소
                  }}
                  title="취소"
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80 flex items-center gap-1"
                  style={{
                    backgroundColor: themeVars?.accent ?? '#4ade80',
                    color: '#000',
                    fontWeight: 600,
                    opacity: saving ? 0.5 : 1,
                  }}
                  onClick={handleSave}
                  title="저장"
                  disabled={saving}
                >
                  <Save size={12} />
                  {saving ? '저장 중...' : '저장'}
                </button>
              </>
            )}

            {/* 닫기 */}
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-red-500/20"
              style={{ color: themeVars?.text }}
              onClick={onClose}
              title="닫기 (ESC)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{
            backgroundColor: themeVars?.bg ?? '#0f172a',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {editedData && !editedData._error ? (
            <>
              {renderNode(editedData, 'root', 0)}
              {/* 편집 모드: 루트가 객체/배열이면 맨 앞 추가 버튼 */}
              {editMode && editedData && typeof editedData === 'object' && (
                <div className="mt-1">
                  <button
                    title={Array.isArray(editedData) ? '맨 앞에 요소 추가' : '맨 앞에 키 추가'}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:opacity-80"
                    style={{
                      backgroundColor: `${themeVars?.accent ?? '#3b82f6'}20`,
                      color: themeVars?.accent ?? '#3b82f6',
                      border: `1px dashed ${themeVars?.accent ?? '#3b82f6'}`,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => { e.stopPropagation(); handleInsertFirst('root'); }}
                  >
                    <Plus size={10} />
                    {Array.isArray(editedData) ? '맨 앞에 요소 추가' : '맨 앞에 키 추가'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8" style={{ color: '#f87171' }}>
              {editedData?._error || 'JSON 데이터를 로드할 수 없습니다.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
