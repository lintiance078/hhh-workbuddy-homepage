/* 共用鉴权：签发 / 校验 token
 *
 * 设计取向：
 *   - 密码只存在环境变量 ADMIN_PASSWORD 里，代码里一个字都不留。
 *   - 登录成功发一张带签名的 token（HMAC-SHA256），前端存 localStorage。
 *   - token 里带过期时间，默认 30 天；密钥用 SECRET，没配就退回用密码本身派生。
 *   - 不用 session 表：Pages Functions 是无状态的，签名 token 最省事也够用。
 */

const DAY = 86400000;

/* 取签名密钥：优先 SECRET 环境变量，否则用密码派生一个（保证"只配密码也能跑"） */
function secretOf(env){
  return (env && env.APP_SECRET) || ('hhh::' + ((env && env.ADMIN_PASSWORD) || ''));
}

function b64url(bytes){
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str){
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return atob(s + pad);
}

async function hmacKey(secret){
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

/* 签发 token：payload 里放过期时间，签名防篡改 */
export async function sign(env, days = 30){
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    role: 'admin',
    exp: Date.now() + days * DAY
  })));
  const key = await hmacKey(secretOf(env));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return payload + '.' + b64url(sig);
}

/* 校验 token：签名对 + 没过期，两个都满足才算通过 */
export async function verify(env, token){
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try{
    const key = await hmacKey(secretOf(env));
    // 把 base64url 签名还原成 ArrayBuffer
    const sigStr = b64urlDecode(sig);
    const sigBuf = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigBuf[i] = sigStr.charCodeAt(i);

    const ok = await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(payload));
    if (!ok) return false;

    const data = JSON.parse(b64urlDecode(payload));
    return data && data.role === 'admin' && data.exp > Date.now();
  }catch(e){
    return false;
  }
}

/* 从请求头里掏 token */
export function tokenFrom(request){
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : '';
}

/* 是不是管理员 */
export async function isAdmin(request, env){
  return verify(env, tokenFrom(request));
}

/* 统一的 JSON 响应 */
export function json(data, status = 200, extra = {}){
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra
    }
  });
}
