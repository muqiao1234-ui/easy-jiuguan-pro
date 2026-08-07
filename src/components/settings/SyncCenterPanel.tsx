import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { createBackupPayload, downloadJsonFile, importBackupPayload, readJsonFile } from '../../utils/backup';
import {
  beginOAuth,
  downloadSync,
  SyncConfigurationError,
  SyncConflictError,
  uploadSync,
  type SyncUploadProgress,
} from '../../utils/sync';
import * as Stores from '../../db/stores';

type Tab = 'sync' | 'secrets';

const DEFAULT_ONEDRIVE_CLIENT_ID = 'e56c3d5e-5d1e-42cf-b14c-44513e68127a';

interface SyncCenterPanelProps {
  onBack: () => void;
  initialTab?: Tab;
  initialAction?: 'upload' | 'download' | null;
  onInitialActionHandled?: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Operation failed. Check the provider configuration and browser CORS policy.';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '计算中';
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.ceil(seconds % 60)} 秒`;
}

export default function SyncCenterPanel({ onBack, initialTab = 'sync', initialAction = null, onInitialActionHandled }: SyncCenterPanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState<Stores.SyncSettings>({ provider: 'local', onedriveClientId: DEFAULT_ONEDRIVE_CLIENT_ID });
  const [secrets, setSecrets] = useState<Stores.SecretEntry[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null);
  const [secretForm, setSecretForm] = useState({ name: '', value: '', kind: 'apiKey' as Stores.SecretKind });
  const [gistTokenInput, setGistTokenInput] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const handledInitialActionRef = useRef<'upload' | 'download' | null>(null);
  const downloadInFlightRef = useRef(false);
  const uploadCancelRef = useRef<(() => void) | null>(null);
  const uploadStartedAtRef = useRef(0);
  const uploadLastUpdateAtRef = useRef(0);
  const [uploadProgress, setUploadProgress] = useState<SyncUploadProgress & { speed: number; eta: number } | null>(null);
  const [vaultReady, setVaultReady] = useState(false);

  const isMobileDevice = () => /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const reloadVault = async () => {
    const [nextSettings, nextSecrets] = await Promise.all([Stores.getSyncSettings(), Stores.getAllSecrets()]);
    setSettings({ ...nextSettings, onedriveClientId: nextSettings.onedriveClientId || DEFAULT_ONEDRIVE_CLIENT_ID });
    setSecrets(nextSecrets);
  };

  useEffect(() => { reloadVault().finally(() => setVaultReady(true)); }, []);
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const saveSettings = async () => {
    let nextSettings = settings;
    if (gistTokenInput.trim()) {
      const secret = await Stores.createSecret('GitHub Gist Token', gistTokenInput.trim(), 'syncToken');
      nextSettings = { ...nextSettings, gistTokenSecretId: secret.id };
      setSettings(nextSettings);
      setGistTokenInput('');
    }
    await Stores.setSyncSettings(nextSettings);
    await reloadVault();
  };

  const exportLocal = async () => {
    try {
      setBusy(true);
      downloadJsonFile(await createBackupPayload(), 'easyjiuguanpro-sync.json');
      setStatus('Local sync package downloaded. It contains business data only, never secrets.');
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };

  const importLocal = async (file?: File) => {
    if (!file) return;
    try {
      setBusy(true);
      const payload = await readJsonFile(file);
      if (!window.confirm('Import will replace local business data. A safety backup will be downloaded first. Continue?')) return;
      downloadJsonFile(await createBackupPayload(), `easyjiuguanpro-before-import-${Date.now()}.json`);
      await importBackupPayload(payload);
      setStatus('Local sync import completed. Refreshing the app...');
      setTimeout(() => window.location.reload(), 400);
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };

  const handleUpload = async (force = false) => {
    try {
      setBusy(true);
      setUploadProgress(null);
      uploadStartedAtRef.current = 0;
      setStatus('正在打包同步数据，请稍候...');
      await saveSettings();
      await uploadSync(force, (progress) => {
        const now = Date.now();
        if (now - uploadLastUpdateAtRef.current < 200 && progress.loaded < progress.total) return;
        uploadLastUpdateAtRef.current = now;
        if (!uploadStartedAtRef.current) uploadStartedAtRef.current = now;
        const elapsed = Math.max((now - uploadStartedAtRef.current) / 1000, 0.1);
        const speed = progress.loaded / elapsed;
        setUploadProgress({ ...progress, speed, eta: speed > 0 ? (progress.total - progress.loaded) / speed : 0 });
      }, (cancel) => { uploadCancelRef.current = cancel; });
      await reloadVault();
      setStatus(`上传同步完成：${new Date().toLocaleString()}`);
    } catch (error) {
      if (error instanceof SyncConflictError && window.confirm('The remote copy changed on another device. Overwrite it with this device?')) {
        await handleUpload(true);
        return;
      }
      setStatus(errorMessage(error));
    } finally {
      uploadCancelRef.current = null;
      setUploadProgress(null);
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (downloadInFlightRef.current) {
      setStatus('下载同步正在处理中，请等待当前操作完成。');
      return;
    }
    downloadInFlightRef.current = true;
    try {
      setBusy(true);
      setStatus('正在读取并校验远端同步数据...');
      await saveSettings();
      const remote = await downloadSync();
      const mobileDevice = isMobileDevice();
      setStatus('远端同步包已校验，等待确认导入...');
      const confirmation = mobileDevice
        ? '下载同步将覆盖本机的对话、角色卡等业务数据。\n\n手机浏览器不会自动下载安全备份，避免下载弹窗打断导入。请确认你已先手动导出本地备份。\n\n继续导入远端数据？'
        : '下载同步将覆盖本机的对话、角色卡等业务数据。确认后会先自动下载一份本地安全备份，再导入远端数据。\n\n继续？';
      if (!window.confirm(confirmation)) {
        setStatus('Remote package checked; local data was not changed.');
        return;
      }
      if (mobileDevice) {
        setStatus('正在导入远端数据...（手机端已跳过自动下载安全备份）');
      } else {
        setStatus('正在保存本地安全备份...');
        downloadJsonFile(await createBackupPayload(), `easyjiuguanpro-before-download-${Date.now()}.json`);
        setStatus('正在导入远端数据...');
      }
      await importBackupPayload(remote.data);
      setStatus('同步完成，正在刷新应用...');
      setTimeout(() => window.location.reload(), 400);
    } catch (error) { setStatus(errorMessage(error)); } finally {
      downloadInFlightRef.current = false;
      setBusy(false);
    }
  };

  const connectOAuth = async (provider: 'onedrive' | 'dropbox') => {
    try { await saveSettings(); await beginOAuth(provider); } catch (error) { setStatus(errorMessage(error)); }
  };

  useEffect(() => {
    if (!vaultReady || !initialAction || handledInitialActionRef.current === initialAction) return;
    handledInitialActionRef.current = initialAction;
    onInitialActionHandled?.();
    void (initialAction === 'upload' ? handleUpload() : handleDownload());
  }, [initialAction, onInitialActionHandled, vaultReady]);

  const saveSecret = async () => {
    if (!secretForm.name.trim()) { setStatus('A secret name is required.'); return; }
    if (!editingSecretId && !secretForm.value.trim()) { setStatus('A secret value is required.'); return; }
    try {
      setBusy(true);
      if (editingSecretId) {
        await Stores.updateSecret(editingSecretId, { name: secretForm.name.trim(), ...(secretForm.value.trim() ? { value: secretForm.value.trim() } : {}) });
      } else {
        await Stores.createSecret(secretForm.name.trim(), secretForm.value.trim(), secretForm.kind);
      }
      setSecretForm({ name: '', value: '', kind: 'apiKey' });
      setEditingSecretId(null);
      await reloadVault();
      setStatus('Secret saved locally. It will not be exported or synchronized.');
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };

  const editSecret = (secret: Stores.SecretEntry) => {
    setEditingSecretId(secret.id);
    setSecretForm({ name: secret.name, value: '', kind: secret.kind });
    setTab('secrets');
  };

  const deleteSecret = async (secret: Stores.SecretEntry) => {
    const [modelReferences, imageReferences] = await Promise.all([
      Stores.getSecretModelReferences(secret.id),
      Stores.getSecretImageChannelReferences(secret.id),
    ]);
    const usages = [
      ...modelReferences.map((model) => `文字模型：${model.name}`),
      ...imageReferences.map((channel) => `生图渠道：${channel.name}`),
    ];
    const warning = usages.length ? `\n\n正在使用此密钥：${usages.join('、')}` : '';
    if (!window.confirm(`删除密钥“${secret.name}”？${warning}`)) return;
    await Stores.deleteSecret(secret.id);
    await reloadVault();
  };

  const secretOptions = secrets;
  const gistTokenOptions = secrets.filter((secret) => secret.kind === 'syncToken' || secret.kind === 'apiKey');
  const setProvider = (provider: Stores.SyncProvider) => setSettings((prev) => ({ ...prev, provider }));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><Icon name="chevron" size={14} className="rotate-90" /> 返回设置</Button>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">导出、同步与密钥管理</h2>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button type="button" onClick={() => setTab('sync')} className={`px-3 py-2 text-sm border-b-2 ${tab === 'sync' ? 'border-amber-500 text-amber-600 dark:text-amber-300' : 'border-transparent text-slate-600 dark:text-slate-400'}`}>手动同步</button>
        <button type="button" onClick={() => setTab('secrets')} className={`px-3 py-2 text-sm border-b-2 ${tab === 'secrets' ? 'border-amber-500 text-amber-600 dark:text-amber-300' : 'border-transparent text-slate-600 dark:text-slate-400'}`}>密钥管理器</button>
      </div>

      {status && <div className="flex items-center gap-2 text-xs rounded-md border border-amber-300/60 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 px-3 py-2">
        {busy && <Icon name="refresh" size={13} className="animate-spin" />}
        <span>{status}</span>
      </div>}
      {uploadProgress && <div className="rounded-md border border-blue-300/70 dark:border-blue-700/70 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span>正在上传同步包：{Math.min(100, Math.round((uploadProgress.loaded / Math.max(uploadProgress.total, 1)) * 100))}%</span>
          <span>{formatBytes(uploadProgress.speed)}/秒，剩余约 {formatDuration(uploadProgress.eta)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
          <div className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-200" style={{ width: `${Math.min(100, (uploadProgress.loaded / Math.max(uploadProgress.total, 1)) * 100)}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-blue-800/80 dark:text-blue-200/80">
          <span>{formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}</span>
          {uploadCancelRef.current && <Button size="sm" variant="danger" onClick={() => uploadCancelRef.current?.()}>取消上传</Button>}
        </div>
      </div>}

      {tab === 'sync' && <div className="space-y-4">
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">同步方式</h3>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-100 mt-1">同步包包含角色、对话、世界书、状态书和表情包，不含 API Key、同步令牌或密码。</p>
            <div className="mt-3 rounded-md border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100">
              <p>新手提示：本地文件版请优先使用 Git 同步；Git 静态页面和自部署推荐 Microsoft OneDrive 同步。</p>
              <p className="mt-1">所有同步均存放在您的私人网盘或 Git 仓库，与作者无关。作者不保证同步功能 100% 成功或有效，请先本地备份后再同步。</p>
              <p className="mt-1 font-semibold text-red-800 dark:text-red-200">导入同步会覆盖所有对话和角色卡，请先本地备份。</p>
            </div>
          </div>
          <select className="input-field" value={settings.provider} onChange={(event) => setProvider(event.target.value as Stores.SyncProvider)}>
            <option value="local">本地 JSON 导入 / 导出（离线）</option>
            <option value="onedrive">Microsoft OneDrive（OAuth PKCE）</option>
            <option value="gist">GitHub Secret Gist（需 PAT）</option>
            <option value="dropbox">Dropbox（OAuth PKCE）</option>
            <option value="webdav">私人 NAS WebDAV</option>
          </select>
          {settings.provider !== 'local' && <div>
            <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">远端文件路径</label>
            <input className="input-field" value={settings.remotePath || ''} onChange={(event) => setSettings((prev) => ({ ...prev, remotePath: event.target.value }))} placeholder="easyjiuguanpro-sync.json" />
          </div>}

          {settings.provider !== 'local' && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 border-l-2 border-amber-400/70 pl-2">
              <span>上次上传：{settings.lastUploadedAt ? new Date(settings.lastUploadedAt).toLocaleString() : '从未上传'}</span>
              <span>上次下载：{settings.lastDownloadedAt ? new Date(settings.lastDownloadedAt).toLocaleString() : '从未下载'}</span>
            </div>
          )}

          {settings.provider === 'local' && <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={exportLocal} loading={busy}>导出同步包</Button>
            <Button size="sm" variant="secondary" onClick={() => importInputRef.current?.click()} loading={busy}>导入同步包</Button>
            <input ref={importInputRef} type="file" className="hidden" accept=".json,application/json" onChange={(event) => importLocal(event.target.files?.[0])} />
          </div>}

          {settings.provider === 'webdav' && <div className="space-y-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-400">NAS 必须允许浏览器 CORS，并放行 OPTIONS、GET、PUT 与 Authorization 请求头。</p>
            <input className="input-field" value={settings.webdavUrl || ''} onChange={(event) => setSettings((prev) => ({ ...prev, webdavUrl: event.target.value }))} placeholder="https://nas.example.com/dav/EasyJiuguanPro" />
            <SecretSelect label="WebDAV 用户名" value={settings.webdavUsernameSecretId} secrets={secretOptions} onChange={(id) => setSettings((prev) => ({ ...prev, webdavUsernameSecretId: id }))} />
            <SecretSelect label="WebDAV 密码" value={settings.webdavPasswordSecretId} secrets={secretOptions} onChange={(id) => setSettings((prev) => ({ ...prev, webdavPasswordSecretId: id }))} />
          </div>}

          {settings.provider === 'gist' && <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">为避免两台设备写入同一文件，Gist 会在内部按设备分别保存同步包，并在下载时选择最新有效包。请不要手动删除这些设备文件；首次上传发现远端已有未知包时会要求确认。</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">Secret Gist 不是严格私密。请妥善保管链接；私人内容建议后续配合加密功能。</p>
            <input className="input-field" value={settings.gistId || ''} onChange={(event) => setSettings((prev) => ({ ...prev, gistId: event.target.value }))} placeholder="Gist ID（首次上传可留空自动创建）" />
            <div className="space-y-1">
              <label className="block text-xs text-slate-700 dark:text-slate-300">GitHub PAT（需 Gists: write）</label>
              <input className="input-field" type="password" value={gistTokenInput} onChange={(event) => setGistTokenInput(event.target.value)} placeholder="直接粘贴 ghp_ 开头的 GitHub Token" autoComplete="new-password" />
              <select className="input-field" value={settings.gistTokenSecretId || ''} onChange={(event) => setSettings((prev) => ({ ...prev, gistTokenSecretId: event.target.value }))}>
                <option value="">或从密钥管理器选择已有密钥</option>
                {gistTokenOptions.map((secret) => <option key={secret.id} value={secret.id}>{secret.name} ({secret.kind === 'syncToken' ? '同步 Token' : 'API Key'})</option>)}
              </select>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">直接输入并保存后会新建本机命名密钥，不会被导出或同步。直接输入优先于下拉选择。</p>
            </div>
            <details className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200">如何获取你的 GitHub 专属密钥（Token）？</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                <li>打开并登录 GitHub（需自备 GitHub 可用网络）：<a className="underline text-blue-700 dark:text-blue-300" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a></li>
                <li>点击右上角的 “Generate new token (classic)”。</li>
                <li>Note（备注）可填写“酒馆备份”；Expiration 推荐选择无过期。</li>
                <li>仅勾选权限“gist (Create gists)”，不要勾选 `repo` 等其他权限，以保护账号安全。</li>
                <li>滚动到最底部点击绿色的 “Generate token”。</li>
                <li>复制生成的 `ghp_` 开头长字符串，粘贴到上方 GitHub Token 输入框。</li>
              </ol>
            </details>
          </div>}

          {settings.provider === 'onedrive' && <div className="space-y-2">
            <p className="text-[11px] text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30 rounded-md px-2.5 py-2 leading-relaxed">
              文件保存在你的个人微软盘。注意：本地文件版本不能完成 OAuth；需要该服务请使用作者的 GitHub 托管静态网页：
              <a className="underline font-medium ml-1 break-all" href="https://muqiao1234-ui.github.io/easy-jiuguan-pro/" target="_blank" rel="noreferrer">https://muqiao1234-ui.github.io/easy-jiuguan-pro/</a>
            </p>
            <input className="input-field" value={settings.onedriveClientId || ''} onChange={(event) => setSettings((prev) => ({ ...prev, onedriveClientId: event.target.value }))} placeholder="Microsoft application (client) ID" />
            <Button size="sm" variant="secondary" onClick={() => connectOAuth('onedrive')}>登录 OneDrive</Button>
            <p className="text-[10px] text-slate-600 dark:text-slate-400">登录后会将刷新令牌仅保存于本机密钥管理器，常规到期会自动续期。</p>
            {settings.onedriveAccessTokenSecretId && <p className="text-[11px] text-emerald-700 dark:text-emerald-300">已保存本机登录令牌{settings.onedriveExpiresAt ? `，到期：${new Date(settings.onedriveExpiresAt).toLocaleString()}` : ''}</p>}
          </div>}

          {settings.provider === 'dropbox' && <div className="space-y-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-400">需在 Dropbox App Console 注册应用和当前 Redirect URI。本地 file:// 不能完成 OAuth。</p>
            <input className="input-field" value={settings.dropboxClientId || ''} onChange={(event) => setSettings((prev) => ({ ...prev, dropboxClientId: event.target.value }))} placeholder="Dropbox app key" />
            <Button size="sm" variant="secondary" onClick={() => connectOAuth('dropbox')}>登录 Dropbox</Button>
            <p className="text-[10px] text-slate-600 dark:text-slate-400">登录后会将刷新令牌仅保存于本机密钥管理器，常规到期会自动续期。</p>
            {settings.dropboxAccessTokenSecretId && <p className="text-[11px] text-emerald-700 dark:text-emerald-300">已保存本机登录令牌{settings.dropboxExpiresAt ? `，到期：${new Date(settings.dropboxExpiresAt).toLocaleString()}` : ''}</p>}
          </div>}

          {settings.provider !== 'local' && <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={saveSettings} loading={busy}>保存同步设置</Button>
            <Button size="sm" onClick={() => handleUpload()} loading={busy}>上传同步</Button>
            <Button size="sm" variant="secondary" onClick={handleDownload} loading={busy}>下载同步</Button>
          </div>}
        </div>
      </div>}

      {tab === 'secrets' && <div className="space-y-4">
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{editingSecretId ? '编辑命名密钥' : '新增命名密钥'}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">仅存于当前浏览器。本页不会显示已保存的原始值；留空密钥值即可只改名称。</p>
          </div>
          <input className="input-field" value={secretForm.name} onChange={(event) => setSecretForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称，例如 OpenAI 主账户" />
          {!editingSecretId && <select className="input-field" value={secretForm.kind} onChange={(event) => setSecretForm((prev) => ({ ...prev, kind: event.target.value as Stores.SecretKind }))}>
            <option value="apiKey">API Key</option>
            <option value="syncToken">同步 Token / PAT</option>
            <option value="syncPassword">同步账号或密码</option>
          </select>}
          <input className="input-field" type="password" value={secretForm.value} onChange={(event) => setSecretForm((prev) => ({ ...prev, value: event.target.value }))} placeholder={editingSecretId ? '留空则不修改原密钥' : '输入密钥内容'} autoComplete="new-password" />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveSecret} loading={busy}>{editingSecretId ? '保存修改' : '保存密钥'}</Button>
            {editingSecretId && <Button size="sm" variant="ghost" onClick={() => { setEditingSecretId(null); setSecretForm({ name: '', value: '', kind: 'apiKey' }); }}>取消编辑</Button>}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
          {secrets.length === 0 && <p className="p-4 text-sm text-slate-600 dark:text-slate-400">还没有本机密钥。</p>}
          {secrets.map((secret) => (
            <div key={secret.id} className="p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900 dark:text-slate-100 truncate">{secret.name}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{secret.kind === 'apiKey' ? 'API Key' : secret.kind === 'syncToken' ? '同步 Token' : '同步账号/密码'} · 已隐藏</p>
              </div>
              <button type="button" title="编辑密钥" onClick={() => editSecret(secret)} className="p-1 text-slate-600 dark:text-slate-300 hover:text-amber-600"><Icon name="edit" size={15} /></button>
              <button type="button" title="删除密钥" onClick={() => deleteSecret(secret)} className="p-1 text-slate-600 dark:text-slate-300 hover:text-red-600"><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}

function SecretSelect({ label, value, secrets, onChange }: { label: string; value?: string; secrets: Stores.SecretEntry[]; onChange: (id: string) => void }) {
  return (
    <label className="block text-xs text-slate-700 dark:text-slate-300">
      {label}
      <select className="input-field mt-1" value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择密钥管理器中的条目</option>
        {secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name} ({secret.kind})</option>)}
      </select>
    </label>
  );
}
