import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Search, Maximize2, Minimize2, Edit3, Save } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { getBaseName } from '../../utils/pathUtils';

interface JsonViewerModalProps {
  path: string;
  data: any;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/**
 * JSON 뷰어 모달
 * - 폴딩/펼치기 기능 (전체 펼치기/접기 버튼)
 * - 타입 표시 On/Off
 * - 검색 기능 (키·값 검색)
 */
export default function JsonViewerModal({ path, data, onClose, themeVars }: JsonViewerModalProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
  const [showTypes, setShowTypes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<any>(data);
  const [saving, setSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
          </div>

          {/* 자식 노드 (펼쳐져 있을 때만) */}
          {isContainer && childExpanded && renderNode(value, childPath, depth + 1)}
        </div>
      );
    });

    return nodes;
  };

  const fileName = getBaseName(path);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
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
            renderNode(editedData, 'root', 0)
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
