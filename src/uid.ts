// The id of a UID, the same as voyage/fetch.py uid_digest gives: PBKDF2-HMAC-SHA256 of the UID in decimal (no leading
// zeros), salt "hane-voyage:v1", 100000 rounds, the first 3 bytes in hex. It runs here with WebCrypto, so a UID typed in
// never leaves the device. Changing it means changing fetch.py and every snapshot (dev/test_voyage.py checks the two agree).
export async function uidId(uid: string){
  const te = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', te.encode(BigInt(uid).toString()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:te.encode('hane-voyage:v1'), iterations:100000 }, key, 24);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
