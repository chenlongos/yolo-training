const BASE = '/api/v1';

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
  get: (url: string) => fetch(BASE + url).then(handleResponse),
  post: (url: string, data?: unknown) =>
    fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(handleResponse),
  put: (url: string, data?: unknown) =>
    fetch(BASE + url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(handleResponse),
  delete: (url: string) =>
    fetch(BASE + url, { method: 'DELETE' }).then(handleResponse),
  upload: (url: string, formData: FormData, onProgress?: (pct: number) => void) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE + url);
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
