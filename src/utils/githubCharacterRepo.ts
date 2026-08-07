import type { GitHubCharacterRepository } from '../types';

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
export const MAX_REMOTE_CHARACTER_CARD_BYTES = 20 * 1024 * 1024;

export interface GitHubCharacterFile {
  path: string;
  name: string;
  size: number;
  sha: string;
  kind: 'png' | 'json';
  rawUrl: string;
}

export interface LoadedGitHubCharacterRepository {
  repository: GitHubCharacterRepository;
  branch: string;
  description: string;
  htmlUrl: string;
  files: GitHubCharacterFile[];
  rateLimitRemaining: number | null;
}

interface GitHubRepositoryResponse {
  default_branch?: string;
  private?: boolean;
  description?: string | null;
  html_url?: string;
}

interface GitHubTreeResponse {
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }>;
}

function apiHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function createRepository(owner: string, repo: string, branch?: string): GitHubCharacterRepository {
  const normalizedOwner = owner.trim();
  const normalizedRepo = repo.trim().replace(/\.git$/i, '');
  const normalizedBranch = branch?.trim() || undefined;
  return {
    id: `${normalizedOwner.toLowerCase()}/${normalizedRepo.toLowerCase()}${normalizedBranch ? `#${normalizedBranch}` : ''}`,
    owner: normalizedOwner,
    repo: normalizedRepo,
    branch: normalizedBranch,
    addedAt: Date.now(),
  };
}

export function parseGitHubCharacterRepository(input: string): GitHubCharacterRepository {
  const raw = input.trim();
  if (!raw) throw new Error('请输入 GitHub 公开仓库地址。');

  let owner = '';
  let repo = '';
  let branch: string | undefined;
  const shortMatch = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) {
    [, owner, repo] = shortMatch;
  } else {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error('仓库地址格式无效。可填写 owner/repo 或 https://github.com/owner/repo。');
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
      throw new Error('目前只支持 github.com 的公开仓库地址。');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) throw new Error('仓库地址需要包含 owner 和 repo。');
    [owner, repo] = parts;
    if (parts[2] === 'tree' && parts[3]) branch = decodeURIComponent(parts[3]);
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('仓库地址包含不支持的 owner 或 repo 名称。');
  }
  return createRepository(owner, repo, branch);
}

function rawFileUrl(repository: GitHubCharacterRepository, branch: string, path: string): string {
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${RAW_BASE}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
}

async function requireOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  if (response.status === 404) throw new Error('未找到公开仓库。请检查地址，私有仓库不在此功能支持范围内。');
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制了访问频率，请稍后再试。');
  throw new Error(`${fallback}（HTTP ${response.status}）`);
}

export async function loadGitHubCharacterRepository(
  requestedRepository: GitHubCharacterRepository,
  signal?: AbortSignal
): Promise<LoadedGitHubCharacterRepository> {
  const repoUrl = `${API_BASE}/repos/${encodeURIComponent(requestedRepository.owner)}/${encodeURIComponent(requestedRepository.repo)}`;
  const repositoryResponse = await fetch(repoUrl, { headers: apiHeaders(), signal, cache: 'no-store' });
  await requireOk(repositoryResponse, '读取仓库信息失败');
  const repositoryInfo = await repositoryResponse.json() as GitHubRepositoryResponse;
  if (repositoryInfo.private) throw new Error('此仓库不是公开仓库，当前仅支持公开访问。');

  const branch = requestedRepository.branch || repositoryInfo.default_branch;
  if (!branch) throw new Error('无法识别仓库的默认分支。');
  const repository = createRepository(requestedRepository.owner, requestedRepository.repo, branch);
  const treeUrl = `${repoUrl}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const treeResponse = await fetch(treeUrl, { headers: apiHeaders(), signal, cache: 'no-store' });
  await requireOk(treeResponse, '读取仓库文件列表失败');
  const tree = await treeResponse.json() as GitHubTreeResponse;
  if (tree.truncated) {
    throw new Error('仓库文件过多，GitHub 无法完整列出。请绑定专门存放角色卡的较小仓库。');
  }

  const files = (tree.tree || [])
    .filter((item) => item.type === 'blob' && item.path && item.sha)
    .map((item): GitHubCharacterFile | null => {
      const path = item.path!;
      const extension = path.split('.').pop()?.toLowerCase();
      if (extension !== 'png' && extension !== 'json') return null;
      const size = Number(item.size) || 0;
      if (size > MAX_REMOTE_CHARACTER_CARD_BYTES) return null;
      return {
        path,
        name: path.split('/').pop() || path,
        size,
        sha: item.sha!,
        kind: extension,
        rawUrl: rawFileUrl(repository, branch, path),
      };
    })
    .filter((file): file is GitHubCharacterFile => Boolean(file))
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));

  return {
    repository,
    branch,
    description: repositoryInfo.description?.trim() || '',
    htmlUrl: repositoryInfo.html_url || `https://github.com/${repository.owner}/${repository.repo}`,
    files,
    rateLimitRemaining: Number(treeResponse.headers.get('x-ratelimit-remaining')) || null,
  };
}

export async function downloadGitHubCharacterCard(file: GitHubCharacterFile, signal?: AbortSignal): Promise<File> {
  if (file.size > MAX_REMOTE_CHARACTER_CARD_BYTES) {
    throw new Error('该角色卡超过 20 MiB 的安全下载限制。');
  }
  const response = await fetch(file.rawUrl, { signal, cache: 'no-store' });
  await requireOk(response, '下载角色卡失败');
  const contentLength = Number(response.headers.get('content-length')) || 0;
  if (contentLength > MAX_REMOTE_CHARACTER_CARD_BYTES) {
    throw new Error('该角色卡超过 20 MiB 的安全下载限制。');
  }
  const blob = await response.blob();
  if (blob.size > MAX_REMOTE_CHARACTER_CARD_BYTES) {
    throw new Error('该角色卡超过 20 MiB 的安全下载限制。');
  }
  if (blob.size < 1024 && (await blob.text()).startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error('该文件由 Git LFS 管理，无法作为普通角色卡直接下载。');
  }
  const type = file.kind === 'png' ? 'image/png' : 'application/json';
  return new File([blob], file.name, { type, lastModified: Date.now() });
}

export function saveGitHubCharacterCard(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
