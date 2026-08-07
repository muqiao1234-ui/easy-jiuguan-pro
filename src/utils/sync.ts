import type { BackupData } from './backup';
import { createBackupPayload, normalizeBackupPayload } from './backup';
import {
  createSecret,
  getSecretById,
  getSyncSettings,
  setSyncSettings,
  updateSecret,
  type SyncProvider,
  type SyncSettings,
} from '../db/stores';
import { generateId } from './id';

export interface SyncEnvelope {
  schemaVersion: 1;
  app: 'EasyJiuguanPro';
  deviceId: string;
  revision: string;
  updatedAt: number;
  data: BackupData;
}

export interface SyncUploadProgress {
  loaded: number;
  total: number;
}

type UploadProgressCallback = (progress: SyncUploadProgress) => void;
type UploadCancelCallback = (cancel: (() => void) | null) => void;

export class SyncConflictError extends Error {
  constructor() { super('Remote data changed since this device last synchronized.'); }
}

export class SyncConfigurationError extends Error {}

class SyncRemoteNotFoundError extends Error {}

const SYNC_FILE_NAME = 'easyjiuguanpro-sync.json';

function remotePath(settings: SyncSettings): string {
  return (settings.remotePath || SYNC_FILE_NAME).replace(/^\/+/, '') || SYNC_FILE_NAME;
}

function parseEnvelope(raw: unknown): SyncEnvelope {
  if (!raw || typeof raw !== 'object') throw new Error('Remote sync file is invalid');
  const envelope = raw as Partial<SyncEnvelope>;
  if (envelope.schemaVersion !== 1 || envelope.app !== 'EasyJiuguanPro' || !envelope.data || typeof envelope.revision !== 'string') {
    throw new Error('Remote sync file is not an EasyJiuguanPro sync package');
  }
  return { ...envelope, data: normalizeBackupPayload(envelope.data) } as SyncEnvelope;
}

async function getToken(id: string | undefined, label: string): Promise<string> {
  const secret = await getSecretById(id);
  if (!secret?.value.trim()) throw new SyncConfigurationError(`${label} is not configured in the Secret Manager`);
  return secret.value.trim();
}

function webdavUrl(settings: SyncSettings): string {
  if (!settings.webdavUrl?.trim()) throw new SyncConfigurationError('WebDAV address is required');
  const base = settings.webdavUrl.trim().replace(/\/+$/, '');
  return `${base}/${remotePath(settings).split('/').map(encodeURIComponent).join('/')}`;
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw new Error(`Sync request failed: HTTP ${response.status}${text ? ` - ${text.slice(0, 180)}` : ''}`);
  try { return JSON.parse(text); } catch { throw new Error('Remote sync file is not valid JSON'); }
}

function throwProviderError(provider: SyncProvider, method: 'GET' | 'PUT', response: Response): never {
  if (method === 'GET' && (response.status === 404 || (provider === 'dropbox' && response.status === 409))) {
    throw new SyncRemoteNotFoundError('Remote sync file does not exist yet');
  }
  if (method === 'PUT' && (response.status === 409 || response.status === 412)) {
    throw new SyncConflictError();
  }
  throw new Error(`${provider} sync request failed: HTTP ${response.status}`);
}

function throwProviderStatusError(provider: SyncProvider, method: 'GET' | 'PUT', status: number): never {
  if (method === 'PUT' && (status === 409 || status === 412)) throw new SyncConflictError();
  if (method === 'GET' && (status === 404 || (provider === 'dropbox' && status === 409))) {
    throw new SyncRemoteNotFoundError('Remote sync file does not exist yet');
  }
  throw new Error(`${provider} sync request failed: HTTP ${status}`);
}

interface XhrUploadResult {
  status: number;
  raw: string;
  headers: Headers;
}

function uploadWithProgress(
  url: string,
  method: string,
  headers: Headers,
  body: string,
  onProgress?: UploadProgressCallback,
  onCancelReady?: UploadCancelCallback,
): Promise<XhrUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    headers.forEach((value, name) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total });
    };
    const clearCancel = () => onCancelReady?.(null);
    onCancelReady?.(() => xhr.abort());
    xhr.onload = () => {
      clearCancel();
      const responseHeaders = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders();
      rawHeaders.trim().split(/[\r\n]+/).forEach((line) => {
        const separator = line.indexOf(':');
        if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      });
      resolve({ status: xhr.status, raw: xhr.responseText || '', headers: responseHeaders });
    };
    xhr.onerror = () => { clearCancel(); reject(new Error('Sync upload failed. Check the network or CORS configuration.')); };
    xhr.ontimeout = () => { clearCancel(); reject(new Error('Sync upload timed out. Please retry when the network is stable.')); };
    xhr.onabort = () => { clearCancel(); reject(new Error('Sync upload cancelled.')); };
    xhr.send(body);
  });
}

async function upsertSyncToken(existingId: string | undefined, name: string, value: string): Promise<string> {
  if (existingId && await getSecretById(existingId)) {
    await updateSecret(existingId, { value });
    return existingId;
  }
  return (await createSecret(name, value, 'syncToken')).id;
}

async function refreshOAuthAccessToken(settings: SyncSettings, provider: 'onedrive' | 'dropbox'): Promise<string> {
  const expiresAt = provider === 'onedrive' ? settings.onedriveExpiresAt : settings.dropboxExpiresAt;
  const accessTokenId = provider === 'onedrive' ? settings.onedriveAccessTokenSecretId : settings.dropboxAccessTokenSecretId;
  const refreshTokenId = provider === 'onedrive' ? settings.onedriveRefreshTokenSecretId : settings.dropboxRefreshTokenSecretId;
  if (!expiresAt || expiresAt > Date.now() + 60_000) return getToken(accessTokenId, `${provider} access token`);

  if (!refreshTokenId) {
    throw new SyncConfigurationError(`${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} authorization has expired. Please log in again.`);
  }
  const clientId = provider === 'onedrive' ? settings.onedriveClientId : settings.dropboxClientId;
  if (!clientId?.trim()) throw new SyncConfigurationError('OAuth application client ID is missing');

  const refreshToken = await getToken(refreshTokenId, `${provider} refresh token`);
  const tokenUrl = provider === 'onedrive'
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    : 'https://api.dropboxapi.com/oauth2/token';
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const token = await readResponseJson(response) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) throw new SyncConfigurationError(`${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} did not return a refreshed access token`);

  const nextAccessTokenId = await upsertSyncToken(accessTokenId, `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} access token`, token.access_token);
  const nextRefreshTokenId = token.refresh_token
    ? await upsertSyncToken(refreshTokenId, `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} refresh token`, token.refresh_token)
    : refreshTokenId;
  const expiresIn = Number(token.expires_in);
  const nextExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined;
  await setSyncSettings(provider === 'onedrive'
    ? { onedriveAccessTokenSecretId: nextAccessTokenId, onedriveRefreshTokenSecretId: nextRefreshTokenId, onedriveExpiresAt: nextExpiresAt }
    : { dropboxAccessTokenSecretId: nextAccessTokenId, dropboxRefreshTokenSecretId: nextRefreshTokenId, dropboxExpiresAt: nextExpiresAt });
  return token.access_token;
}

async function readGistFile(file: { content?: string; raw_url?: string; truncated?: boolean }): Promise<string> {
  if (!file.truncated && typeof file.content === 'string') return file.content;
  if (!file.raw_url) throw new Error('Gist sync file is incomplete and has no raw download URL');
  const rawResponse = await fetch(file.raw_url);
  if (!rawResponse.ok) throw new Error(`GitHub raw Gist download failed: HTTP ${rawResponse.status}`);
  return rawResponse.text();
}

async function providerFetch(
  settings: SyncSettings,
  method: 'GET' | 'PUT',
  body?: string,
  expectedProviderRevision?: string,
  onProgress?: UploadProgressCallback,
  onCancelReady?: UploadCancelCallback,
): Promise<{ raw: string; revision?: string }> {
  const headers = new Headers();
  let url = '';
  if (settings.provider === 'webdav') {
    const username = await getToken(settings.webdavUsernameSecretId, 'WebDAV username');
    const password = await getToken(settings.webdavPasswordSecretId, 'WebDAV password');
    headers.set('Authorization', `Basic ${btoa(`${username}:${password}`)}`);
    if (method === 'PUT') headers.set('Content-Type', 'application/json');
    if (method === 'PUT' && expectedProviderRevision) headers.set('If-Match', expectedProviderRevision);
    if (method === 'PUT') {
      const response = await uploadWithProgress(webdavUrl(settings), method, headers, body || '', onProgress, onCancelReady);
      if (response.status < 200 || response.status >= 300) throwProviderStatusError('webdav', method, response.status);
      return { raw: '', revision: response.headers.get('etag') || undefined };
    }
    const response = await fetch(webdavUrl(settings), { method, headers, body });
    if (!response.ok) throwProviderError('webdav', method, response);
    return { raw: method === 'GET' ? await response.text() : '', revision: response.headers.get('etag') || undefined };
  }
  if (settings.provider === 'gist') {
    const token = await getToken(settings.gistTokenSecretId, 'GitHub token');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    const filename = remotePath(settings);
    if (method === 'GET') {
      if (!settings.gistId) throw new SyncRemoteNotFoundError('GitHub Gist has not been created yet');
      const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(settings.gistId)}`, { headers });
      if (!response.ok) throwProviderError('gist', 'GET', response);
      const gist = await readResponseJson(response) as {
        files?: Record<string, { content?: string; raw_url?: string; truncated?: boolean }>;
        updated_at?: string;
      };
      const candidates = Object.entries(gist.files || {}).filter(([name]) => name === filename || name.startsWith(`${filename}.`));
      if (candidates.length === 0) throw new SyncRemoteNotFoundError(`Gist does not contain ${filename}`);
      const envelopes = await Promise.all(candidates.map(async ([, file]) => {
        try {
          const raw = await readGistFile(file);
          return { raw, envelope: parseEnvelope(JSON.parse(raw)) };
        } catch {
          return null;
        }
      }));
      const valid = envelopes.filter((item): item is { raw: string; envelope: SyncEnvelope } => Boolean(item));
      if (valid.length === 0) throw new Error('No valid EasyJiuguanPro sync package was found in this Gist');
      valid.sort((a, b) => b.envelope.updatedAt - a.envelope.updatedAt);
      return { raw: valid[0].raw, revision: gist.updated_at };
    }
    headers.set('Content-Type', 'application/json');
    const envelope = JSON.parse(body || '{}') as Partial<SyncEnvelope>;
    if (!envelope.deviceId) throw new Error('Sync package is missing device ID');
    // Gist does not support conditional PATCH. Separate device files prevent two devices from overwriting each other.
    const deviceFileName = `${filename}.${encodeURIComponent(envelope.deviceId)}.json`;
    const payload = JSON.stringify({ public: false, description: 'EasyJiuguanPro manual sync', files: { [deviceFileName]: { content: body || '' } } });
    const endpoint = settings.gistId ? `https://api.github.com/gists/${encodeURIComponent(settings.gistId)}` : 'https://api.github.com/gists';
    const response = await uploadWithProgress(endpoint, settings.gistId ? 'PATCH' : 'POST', headers, payload, onProgress, onCancelReady);
    if (response.status < 200 || response.status >= 300) throwProviderStatusError('gist', method, response.status);
    let gist: { id?: string; updated_at?: string };
    try { gist = JSON.parse(response.raw) as { id?: string; updated_at?: string }; } catch { throw new Error('GitHub returned an invalid sync response'); }
    if (!gist.id) throw new Error('GitHub did not return a Gist ID');
    if (!settings.gistId) await setSyncSettings({ gistId: gist.id });
    return { raw: '', revision: gist.updated_at };
  }
  if (settings.provider === 'onedrive') {
    const token = await refreshOAuthAccessToken(settings, 'onedrive');
    headers.set('Authorization', `Bearer ${token}`);
    if (method === 'PUT') headers.set('Content-Type', 'application/json');
    if (method === 'PUT' && expectedProviderRevision) headers.set('If-Match', expectedProviderRevision);
    const encoded = remotePath(settings).split('/').map(encodeURIComponent).join('/');
    const itemUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encoded}:`;
    url = `${itemUrl}/content`;
    if (method === 'GET') {
      const metadataResponse = await fetch(itemUrl, { headers });
      if (!metadataResponse.ok) throwProviderError('onedrive', 'GET', metadataResponse);
      const metadata = await metadataResponse.json() as { eTag?: string };
      const response = await fetch(url, { headers });
      if (!response.ok) throwProviderError('onedrive', 'GET', response);
      return { raw: await response.text(), revision: metadata.eTag };
    }
    const response = await uploadWithProgress(url, method, headers, body || '', onProgress, onCancelReady);
    if (response.status < 200 || response.status >= 300) throwProviderStatusError('onedrive', 'PUT', response.status);
    let item: { eTag?: string };
    try { item = JSON.parse(response.raw) as { eTag?: string }; } catch { throw new Error('OneDrive returned an invalid sync response'); }
    return { raw: '', revision: item.eTag };
  }
  if (settings.provider === 'dropbox') {
    const token = await refreshOAuthAccessToken(settings, 'dropbox');
    headers.set('Authorization', `Bearer ${token}`);
    const path = `/${remotePath(settings)}`;
    if (method === 'PUT') {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Dropbox-API-Arg', JSON.stringify({
        path,
        mode: expectedProviderRevision ? { '.tag': 'update', update: expectedProviderRevision } : 'add',
        autorename: false,
        mute: true,
      }));
      const response = await uploadWithProgress('https://content.dropboxapi.com/2/files/upload', 'POST', headers, body || '', onProgress, onCancelReady);
      if (response.status < 200 || response.status >= 300) throwProviderStatusError('dropbox', 'PUT', response.status);
      let item: { rev?: string };
      try { item = JSON.parse(response.raw) as { rev?: string }; } catch { throw new Error('Dropbox returned an invalid sync response'); }
      return { raw: '', revision: item.rev };
    }
    headers.set('Dropbox-API-Arg', JSON.stringify({ path }));
    const response = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers });
    if (!response.ok) throwProviderError('dropbox', 'GET', response);
    const metadataHeader = response.headers.get('dropbox-api-result');
    let revision: string | undefined;
    try {
      const metadata = metadataHeader ? JSON.parse(metadataHeader) as { rev?: unknown } : null;
      revision = typeof metadata?.rev === 'string' ? metadata.rev : undefined;
    } catch {
      revision = undefined;
    }
    return { raw: await response.text(), revision };
  }
  throw new SyncConfigurationError('Please select a remote sync provider');
}

async function makeEnvelope(settings: SyncSettings): Promise<SyncEnvelope> {
  const deviceId = settings.deviceId || generateId();
  if (!settings.deviceId) await setSyncSettings({ deviceId });
  return { schemaVersion: 1, app: 'EasyJiuguanPro', deviceId, revision: generateId(), updatedAt: Date.now(), data: await createBackupPayload() };
}

export async function uploadSync(force = false, onProgress?: UploadProgressCallback, onCancelReady?: UploadCancelCallback): Promise<SyncEnvelope> {
  const settings = await getSyncSettings();
  if (settings.provider === 'local') throw new SyncConfigurationError('Local JSON uses the export button instead of remote upload');
  let remote: SyncEnvelope | null = null;
  let providerRevision: string | undefined;
  try {
    const result = await providerFetch(settings, 'GET');
    remote = parseEnvelope(JSON.parse(result.raw));
    providerRevision = result.revision;
  } catch (error) {
    if (!(error instanceof SyncRemoteNotFoundError)) throw error;
  }

  if (remote) {
    // An unrecognized existing package must be confirmed explicitly before it is replaced.
    if (!force && (!settings.remoteRevision || remote.revision !== settings.remoteRevision)) {
      throw new SyncConflictError();
    }
  }
  const envelope = await makeEnvelope(settings);
  const result = await providerFetch(settings, 'PUT', JSON.stringify(envelope), providerRevision, onProgress, onCancelReady);
  await setSyncSettings({
    remoteRevision: envelope.revision,
    remoteProviderRevision: result.revision,
    lastUploadedAt: Date.now(),
  });
  return envelope;
}

export async function downloadSync(): Promise<SyncEnvelope> {
  const settings = await getSyncSettings();
  if (settings.provider === 'local') throw new SyncConfigurationError('Use local JSON import for offline sync');
  const result = await providerFetch(settings, 'GET');
  const envelope = parseEnvelope(JSON.parse(result.raw));
  await setSyncSettings({ remoteRevision: envelope.revision, remoteProviderRevision: result.revision, lastDownloadedAt: Date.now() });
  return envelope;
}

function pkceChallenge(verifier: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then((buffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  );
}

function base64UrlRandom(length = 48): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function beginOAuth(provider: Extract<SyncProvider, 'onedrive' | 'dropbox'>): Promise<void> {
  if (window.location.protocol === 'file:') throw new SyncConfigurationError('OAuth requires HTTP(S); open EasyJiuguanPro from a local web server or static site');
  const settings = await getSyncSettings();
  const clientId = provider === 'onedrive' ? settings.onedriveClientId : settings.dropboxClientId;
  if (!clientId?.trim()) throw new SyncConfigurationError('Enter the OAuth application client ID first');
  const verifier = base64UrlRandom();
  const state = base64UrlRandom(24);
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  sessionStorage.setItem('ejp_sync_oauth', JSON.stringify({ provider, verifier, state, redirectUri }));
  const challenge = await pkceChallenge(verifier);
  const endpoint = provider === 'onedrive'
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    : 'https://www.dropbox.com/oauth2/authorize';
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state });
  if (provider === 'onedrive') params.set('scope', 'offline_access Files.ReadWrite.AppFolder');
  if (provider === 'dropbox') params.set('token_access_type', 'offline');
  window.location.assign(`${endpoint}?${params.toString()}`);
}

/** Completes a PKCE redirect. Returns true only when this load handled an OAuth callback. */
export async function completeOAuthFromLocation(): Promise<boolean> {
  const query = new URLSearchParams(window.location.search);
  const providerError = query.get('error');
  if (providerError) {
    const providerErrorDescription = query.get('error_description');
    sessionStorage.removeItem('ejp_sync_oauth');
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    throw new SyncConfigurationError(`OAuth authorization was not completed: ${providerErrorDescription || providerError}`);
  }
  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) return false;
  const stored = sessionStorage.getItem('ejp_sync_oauth');
  if (!stored) return false;
  const pending = JSON.parse(stored) as { provider: 'onedrive' | 'dropbox'; verifier: string; state: string; redirectUri: string };
  if (state !== pending.state) throw new Error('OAuth state verification failed');
  const settings = await getSyncSettings();
  const clientId = pending.provider === 'onedrive' ? settings.onedriveClientId : settings.dropboxClientId;
  if (!clientId) throw new SyncConfigurationError('OAuth client ID is missing');
  const tokenUrl = pending.provider === 'onedrive'
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    : 'https://api.dropboxapi.com/oauth2/token';
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const token = await readResponseJson(response) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error('OAuth provider did not return an access token');
  const accessTokenSecretId = await upsertSyncToken(
    pending.provider === 'onedrive' ? settings.onedriveAccessTokenSecretId : settings.dropboxAccessTokenSecretId,
    `${pending.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} access token`,
    token.access_token,
  );
  const currentRefreshTokenId = pending.provider === 'onedrive' ? settings.onedriveRefreshTokenSecretId : settings.dropboxRefreshTokenSecretId;
  const refreshTokenSecretId = token.refresh_token
    ? await upsertSyncToken(currentRefreshTokenId, `${pending.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} refresh token`, token.refresh_token)
    : currentRefreshTokenId;
  const expiresIn = Number(token.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined;
  await setSyncSettings(pending.provider === 'onedrive'
    ? { provider: 'onedrive', onedriveAccessTokenSecretId: accessTokenSecretId, onedriveRefreshTokenSecretId: refreshTokenSecretId, onedriveExpiresAt: expiresAt }
    : { provider: 'dropbox', dropboxAccessTokenSecretId: accessTokenSecretId, dropboxRefreshTokenSecretId: refreshTokenSecretId, dropboxExpiresAt: expiresAt });
  sessionStorage.removeItem('ejp_sync_oauth');
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  return true;
}
