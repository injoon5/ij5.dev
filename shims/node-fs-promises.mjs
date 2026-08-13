// See `node-module.mjs`. Paired shim for `node:fs/promises`, imported by the
// same never-executed Node resvg provider.
export async function readFile() {
	throw new Error('node:fs/promises is not available in the Workers runtime');
}
