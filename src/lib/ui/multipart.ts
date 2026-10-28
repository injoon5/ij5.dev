import { errorMessage } from './upload';

/**
 * Sends a file to R2 as a multipart upload through `/api/files/uploads`.
 *
 * Parts go up three at a time, each an `XMLHttpRequest` rather than `fetch`
 * because only XHR reports upload progress — and on a multi-gigabyte file a
 * progress bar that moves once per 90 MiB part is a progress bar that looks
 * frozen. A failed part is retried with backoff before the whole upload is
 * given up; cancelling aborts what is in flight and tells R2 to discard the
 * rest.
 */

const CONCURRENCY = 3;
const RETRIES = 3;

/** A rejection that belongs to a field (the slug was taken, the file too
 *  big) rather than to the upload as a whole. */
export class FieldError extends Error {
	constructor(public fields: Record<string, string>) {
		super(Object.values(fields)[0] ?? 'Check the form.');
	}
}

type Options = {
	slug?: string;
	expires?: string;
	onProgress?: (loaded: number, total: number) => void;
	signal?: AbortSignal;
};

async function failure(res: Response, fallback: string): Promise<Error> {
	const copy = res.clone();
	try {
		const body = (await copy.json()) as { fields?: Record<string, string> };
		if (body.fields) return new FieldError(body.fields);
	} catch {
		// Not JSON; fall through to the sentence.
	}
	return new Error(await errorMessage(res, fallback));
}

const api = (path: string, init: RequestInit) =>
	fetch(path, {
		...init,
		headers: { accept: 'application/json', 'content-type': 'application/json', ...init.headers }
	});

/** One part, with progress. Resolves with the etag R2 assigned it. */
function putPart(
	url: string,
	body: Blob,
	onProgress: (loaded: number) => void,
	signal?: AbortSignal
): Promise<{ partNumber: number; etag: string }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', url);
		xhr.setRequestHeader('accept', 'application/json');
		xhr.setRequestHeader('x-part-size', String(body.size));
		// A slice of a File has no type, and a body with no Content-Type is
		// dropped by SvelteKit's request adapter before the handler sees it.
		xhr.setRequestHeader('content-type', 'application/octet-stream');
		xhr.responseType = 'json';
		xhr.upload.onprogress = (e) => onProgress(e.loaded);
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
			else reject(new Error(xhr.response?.message ?? `Part failed (${xhr.status}).`));
		};
		xhr.onerror = () => reject(new Error('The connection dropped.'));
		xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
		signal?.addEventListener('abort', () => xhr.abort(), { once: true });
		xhr.send(body);
	});
}

const wait = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(t);
				reject(new DOMException('Cancelled', 'AbortError'));
			},
			{ once: true }
		);
	});

export async function uploadFile(file: File, options: Options = {}): Promise<{ slug: string }> {
	const { signal, onProgress } = options;

	const start = await api('/api/files/uploads', {
		method: 'POST',
		body: JSON.stringify({ name: file.name, size: file.size, type: file.type, slug: options.slug }),
		signal
	});
	if (!start.ok) throw await failure(start, 'The upload could not start.');
	const { slug, uploadId, partSize } = (await start.json()) as {
		slug: string;
		uploadId: string;
		partSize: number;
	};

	const base = `/api/files/uploads/${encodeURIComponent(slug)}`;
	const query = (extra = '') => `?uploadId=${encodeURIComponent(uploadId)}${extra}`;

	const count = Math.max(1, Math.ceil(file.size / partSize));
	const loaded = new Array<number>(count).fill(0);
	const report = () => onProgress?.(loaded.reduce((a, b) => a + b, 0), file.size);
	const done: Array<{ partNumber: number; etag: string }> = [];

	let next = 0;
	async function worker() {
		while (next < count) {
			const index = next++;
			const blob = file.slice(index * partSize, Math.min(file.size, (index + 1) * partSize));
			for (let attempt = 0; ; attempt++) {
				try {
					const part = await putPart(
						`${base}${query(`&part=${index + 1}`)}`,
						blob,
						(n) => {
							loaded[index] = n;
							report();
						},
						signal
					);
					loaded[index] = blob.size;
					report();
					done.push({ partNumber: part.partNumber, etag: part.etag });
					break;
				} catch (e) {
					loaded[index] = 0;
					report();
					if (signal?.aborted || attempt >= RETRIES) throw e;
					await wait(1000 * 2 ** attempt, signal);
				}
			}
		}
	}

	try {
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, worker));
	} catch (e) {
		// Tell R2 to drop the parts already sent. Best effort: an upload nobody
		// finishes is aborted by R2 itself after a week anyway.
		api(`${base}${query()}`, { method: 'DELETE' }).catch(() => {});
		throw e;
	}

	const finish = await api(base, {
		method: 'POST',
		body: JSON.stringify({ uploadId, parts: done, name: file.name, expires: options.expires }),
		signal
	});
	if (!finish.ok) throw await failure(finish, 'The upload could not be completed.');
	return (await finish.json()) as { slug: string };
}
