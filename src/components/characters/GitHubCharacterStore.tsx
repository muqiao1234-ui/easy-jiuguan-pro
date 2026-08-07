import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitHubCharacterRepository } from '../../types';
import { getUISettings, setUISettings } from '../../db/stores';
import {
  downloadGitHubCharacterCard,
  loadGitHubCharacterRepository,
  parseGitHubCharacterRepository,
  saveGitHubCharacterCard,
  type GitHubCharacterFile,
  type LoadedGitHubCharacterRepository,
} from '../../utils/githubCharacterRepo';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';

interface GitHubCharacterStoreProps {
  onImportCard: (file: File) => Promise<string>;
}

type ViewMode = 'list' | 'thumbnail';
const PAGE_SIZE = 60;

interface RepositoryTreeNode {
  name: string;
  path: string;
  file?: GitHubCharacterFile;
  children?: RepositoryTreeNode[];
}

function buildRepositoryTree(files: GitHubCharacterFile[]): RepositoryTreeNode[] {
  const root: RepositoryTreeNode[] = [];
  const directories = new Map<string, RepositoryTreeNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    let currentPath = '';

    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let directory = directories.get(currentPath);
      if (!directory) {
        directory = { name: part, path: currentPath, children: [] };
        directories.set(currentPath, directory);
        parent.push(directory);
      }
      parent = directory.children!;
    }
    parent.push({ name: file.name, path: file.path, file });
  }

  const sortNodes = (nodes: RepositoryTreeNode[]) => {
    nodes.sort((a, b) => {
      if (Boolean(a.children) !== Boolean(b.children)) return a.children ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    nodes.forEach((node) => node.children && sortNodes(node.children));
  };
  sortNodes(root);
  return root;
}

interface RepositoryTreeProps {
  nodes: RepositoryTreeNode[];
  expandedDirectories: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (file: GitHubCharacterFile) => void;
  depth?: number;
}

function RepositoryTree({
  nodes,
  expandedDirectories,
  onToggleDirectory,
  onSelectFile,
  depth = 0,
}: RepositoryTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children) {
          const expanded = expandedDirectories.has(node.path);
          return (
            <React.Fragment key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-md py-2 pr-2 text-left text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Icon name="chevron" size={13} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
                <Icon name={expanded ? 'folderOpen' : 'folder'} size={15} className="text-amber-500" />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              </button>
              {expanded && (
                <RepositoryTree
                  nodes={node.children}
                  expandedDirectories={expandedDirectories}
                  onToggleDirectory={onToggleDirectory}
                  onSelectFile={onSelectFile}
                  depth={depth + 1}
                />
              )}
            </React.Fragment>
          );
        }

        const file = node.file!;
        return (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelectFile(file)}
            style={{ paddingLeft: `${depth * 1.25 + 1.9}rem` }}
            className="flex w-full min-w-0 items-center gap-2 rounded-md py-2 pr-2 text-left hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${file.kind === 'png' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'}`}>{file.kind.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-800 dark:text-slate-200">{file.name}</span>
            <span className="flex-shrink-0 text-[10px] text-slate-500">{formatSize(file.size)}</span>
          </button>
        );
      })}
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function isSavedRepository(value: unknown): value is GitHubCharacterRepository {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GitHubCharacterRepository>;
  return typeof candidate.id === 'string'
    && typeof candidate.owner === 'string'
    && typeof candidate.repo === 'string';
}

export default function GitHubCharacterStore({ onImportCard }: GitHubCharacterStoreProps) {
  const [repositoryInput, setRepositoryInput] = useState('');
  const [savedRepositories, setSavedRepositories] = useState<GitHubCharacterRepository[]>([]);
  const [loadedRepository, setLoadedRepository] = useState<LoadedGitHubCharacterRepository | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [selectedFile, setSelectedFile] = useState<GitHubCharacterFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'download' | 'import' | null>(null);
  const [message, setMessage] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    void getUISettings().then((settings) => {
      if (!mounted) return;
      const repositories = (settings?.characterCardRepositories || []).filter(isSavedRepository);
      setSavedRepositories(repositories);
    });
    return () => {
      mounted = false;
      requestRef.current?.abort();
    };
  }, []);

  const saveRepositories = useCallback(async (next: GitHubCharacterRepository[]) => {
    setSavedRepositories(next);
    await setUISettings({ characterCardRepositories: next });
  }, []);

  const loadRepository = useCallback(async (repository: GitHubCharacterRepository, persist: boolean) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setMessage('正在读取公开仓库...');
    setSelectedFile(null);
    setVisibleCount(PAGE_SIZE);
    setExpandedDirectories(new Set());
    try {
      const loaded = await loadGitHubCharacterRepository(repository, controller.signal);
      if (controller.signal.aborted) return;
      setLoadedRepository(loaded);
      setRepositoryInput(`${loaded.repository.owner}/${loaded.repository.repo}`);
      if (persist) {
        const next = [
          loaded.repository,
          ...savedRepositories.filter((item) => item.id !== loaded.repository.id),
        ];
        await saveRepositories(next);
      }
      setMessage(loaded.files.length > 0 ? `已找到 ${loaded.files.length} 张兼容角色卡。` : '仓库加载成功，但没有找到 .png 或 .json 角色卡。');
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadedRepository(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [saveRepositories, savedRepositories]);

  const handleBindAndLoad = () => {
    try {
      const repository = parseGitHubCharacterRepository(repositoryInput);
      void loadRepository(repository, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRemoveRepository = (id: string) => {
    void saveRepositories(savedRepositories.filter((repository) => repository.id !== id));
    if (loadedRepository?.repository.id === id) {
      setLoadedRepository(null);
      setSelectedFile(null);
      setMessage('已移除仓库地址；本次加载的文件列表已丢弃。');
    }
  };

  const handleDownload = async () => {
    if (!selectedFile) return;
    setActionLoading('download');
    try {
      const file = await downloadGitHubCharacterCard(selectedFile);
      saveGitHubCharacterCard(file);
      setMessage(`已开始下载 ${file.name}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setActionLoading('import');
    try {
      const file = await downloadGitHubCharacterCard(selectedFile);
      setMessage(await onImportCard(file));
      setSelectedFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(null);
    }
  };

  const repositoryTree = useMemo(
    () => buildRepositoryTree(loadedRepository?.files || []),
    [loadedRepository]
  );
  const thumbnailFiles = useMemo(
    () => loadedRepository?.files.slice(0, visibleCount) || [],
    [loadedRepository, visibleCount]
  );
  const thumbnailNonce = loadedRepository?.repository.id || '';

  const toggleDirectory = (path: string) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <aside className="min-h-full w-full overflow-y-auto bg-white/75 p-5 text-slate-800 dark:bg-slate-900/75 dark:text-slate-100">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-800 text-sm text-slate-200">GH</div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">GitHub 角色卡仓库</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">公开仓库浏览器。只保存已绑定的仓库地址，不缓存文件、缩略图或下载内容。</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="input-field min-w-0 flex-1"
          value={repositoryInput}
          onChange={(event) => setRepositoryInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') handleBindAndLoad(); }}
          placeholder="owner/repo 或 github.com/owner/repo"
          aria-label="GitHub 公开仓库地址"
        />
        <Button size="sm" onClick={handleBindAndLoad} loading={loading}>绑定并加载</Button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-amber-200/80">使用该功能说明你已知晓本功能本质为浏览工具，访问的仓库和下载角色卡与作者无任何关系。</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">常见情况：本工具只按扩展名盲认 `.png` 和 `.json`，无法保证它们 100% 是角色卡；仓库中的图片素材、package.json、配置文件等也可能出现在列表，导入失败属于正常提示。私有仓库、Git LFS 文件、超过 20 MiB 文件和 GitHub 限流也无法直接加载。</p>

      {savedRepositories.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-700/60 pt-2">
          <div className="text-[10px] font-semibold text-slate-500">已绑定仓库</div>
          {savedRepositories.map((repository) => (
            <div key={repository.id} className="flex min-w-0 items-center gap-1 rounded-md px-1 py-1 hover:bg-slate-800/60">
              <button
                type="button"
                onClick={() => { void loadRepository(repository, false); }}
                className="min-w-0 flex-1 truncate text-left text-xs text-slate-300 hover:text-amber-300"
                title={`加载 ${repository.owner}/${repository.repo}`}
              >
                {repository.owner}/{repository.repo}{repository.branch ? `#${repository.branch}` : ''}
              </button>
              <button type="button" onClick={() => handleRemoveRepository(repository.id)} className="p-1 text-slate-500 hover:text-red-400" title="移除仓库地址">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {message && <p className="mt-3 rounded-md border border-slate-700/70 bg-slate-800/50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-300">{message}</p>}

      {loadedRepository && (
        <div className="mt-3 border-t border-slate-700/60 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a href={loadedRepository.htmlUrl} target="_blank" rel="noreferrer" className="truncate text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:underline">{loadedRepository.repository.owner}/{loadedRepository.repository.repo}</a>
              {loadedRepository.description && <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{loadedRepository.description}</p>}
            </div>
            <span className="flex-shrink-0 text-[10px] text-slate-500">{loadedRepository.files.length} 张</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex rounded-md border border-slate-700 p-0.5" role="group" aria-label="角色卡仓库视图模式">
              <button type="button" onClick={() => setViewMode('list')} className={`rounded px-2 py-1 text-[10px] ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>列表</button>
              <button type="button" onClick={() => setViewMode('thumbnail')} className={`rounded px-2 py-1 text-[10px] ${viewMode === 'thumbnail' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>缩略图</button>
            </div>
            {loadedRepository.rateLimitRemaining !== null && <span className="text-[10px] text-slate-600">GitHub 余量 {loadedRepository.rateLimitRemaining}</span>}
          </div>
          {viewMode === 'thumbnail' && <p className="mt-2 text-[10px] leading-relaxed text-amber-200/80">角色卡一般较大，加载较慢。缩略图仅在当前页面即时加载，离开后丢弃。</p>}

          <div className={viewMode === 'thumbnail' ? 'mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3' : 'mt-2 rounded-md border border-slate-200/80 bg-white/50 p-1 dark:border-slate-700/70 dark:bg-slate-800/30'}>
            {viewMode === 'list' ? (
              <RepositoryTree
                nodes={repositoryTree}
                expandedDirectories={expandedDirectories}
                onToggleDirectory={toggleDirectory}
                onSelectFile={setSelectedFile}
              />
            ) : thumbnailFiles.map((file) => (
              <button key={file.path} type="button" onClick={() => setSelectedFile(file)} className="min-w-0 overflow-hidden rounded-md border border-slate-700 bg-slate-800/50 text-left hover:border-amber-500/70">
                <div className="aspect-square bg-slate-900">
                  {file.kind === 'png' ? <img src={`${file.rawUrl}?view=${encodeURIComponent(thumbnailNonce)}`} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-500">JSON</div>}
                </div>
                <div className="truncate px-2 py-1.5 text-[10px] text-slate-300" title={file.path}>{file.name}</div>
              </button>
            ))}
          </div>

          {viewMode === 'thumbnail' && loadedRepository.files.length > thumbnailFiles.length && (
            <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-2 w-full rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200">加载更多角色卡</button>
          )}
        </div>
      )}

      <Modal open={!!selectedFile} onClose={() => setSelectedFile(null)} title="远端角色卡">
        {selectedFile && (
          <div className="space-y-3">
            <div><p className="break-all text-sm text-slate-100">{selectedFile.name}</p><p className="mt-1 break-all text-xs text-slate-500">{selectedFile.path} · {formatSize(selectedFile.size)}</p></div>
            <p className="text-xs leading-relaxed text-slate-400">文件将从公开 GitHub 仓库即时下载。下载或导入完成后不会保留在本功能中。</p>
            <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={handleDownload} loading={actionLoading === 'download'} disabled={actionLoading !== null}>下载</Button><Button size="sm" onClick={handleImport} loading={actionLoading === 'import'} disabled={actionLoading !== null}>导入</Button></div>
          </div>
        )}
      </Modal>
    </aside>
  );
}
