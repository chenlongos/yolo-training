const BASE = '/api/v1';

export function userId(): string {
  let id = localStorage.getItem('_uid');
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('_uid', id);
  }
  return id;
}

/** Append user query param for requests that may not include X-User header */
export function userParam(): string {
  return `user=${encodeURIComponent(userId())}`;
}

/** Append user query param to a URL path */
export function withUser(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${userParam()}`;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'X-User': userId(), ...extra };
}

async function handleResponse(resp: Response) {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    let msg = `HTTP ${resp.status}`;
    if (body.detail) {
      if (typeof body.detail === 'string') msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ');
      else msg = JSON.stringify(body.detail);
    }
    throw new Error(msg);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  get: (url: string) => fetch(BASE + url, { headers: headers() }).then(handleResponse),
  post: (url: string, data?: unknown) =>
    fetch(BASE + url, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: data ? JSON.stringify(data) : undefined }).then(handleResponse),
  put: (url: string, data?: unknown) =>
    fetch(BASE + url, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: data ? JSON.stringify(data) : undefined }).then(handleResponse),
  delete: (url: string) =>
    fetch(BASE + url, { method: 'DELETE', headers: headers() }).then(handleResponse),
  upload: (url: string, formData: FormData, onProgress?: (pct: number) => void) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE + url);
      xhr.setRequestHeader('X-User', userId());
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(xhr.responseText); }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    }),
};
