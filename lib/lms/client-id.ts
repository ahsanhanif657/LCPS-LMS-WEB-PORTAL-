// Temporary form-row keys only. Persistent record IDs are assigned by the server.
// randomUUID is unavailable on some HTTP LAN previews; getRandomValues remains available.
export function clientRowId():string {
 if(typeof globalThis.crypto.randomUUID==='function')return globalThis.crypto.randomUUID();
 return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
