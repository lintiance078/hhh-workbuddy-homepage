/* POST /api/login  用密码换 token
 *
 * 请求体：{ "password": "..." }
 * 返回：  { ok: true, token: "...", days: 30 }
 *
 * 安全取向：
 *   - 密码比对用固定时间比较，不因为"前面几位对了"而变快。
 *   - 失败不告诉对方"密码错在第几位"，只回一句"密码不对"。
 *   - 简单的失败次数限制：同一 IP 15 分钟内错 8 次就挡一会儿，
 *     防止有人拿字典慢慢试。（内存计数，实例重启会清空，够用。）
 */
import { sign, json } from './_auth.js';

const MAX_FAIL = 8;
const WINDOW   = 15 * 60 * 1000;   /* 15 分钟 */
const fails = new Map();           /* ip -> { n, until } */

function allowed(ip){
  const rec = fails.get(ip);
  if (!rec) return true;
  if (Date.now() > rec.until){ fails.delete(ip); return true; }
  return rec.n < MAX_FAIL;
}
function noteFail(ip){
  const now = Date.now();
  const rec = fails.get(ip);
  if (!rec || now > rec.until) fails.set(ip, { n: 1, until: now + WINDOW });
  else rec.n++;
}
function clearFail(ip){ fails.delete(ip); }

/* 定长比较：先把长度差异消化掉，再逐字符异或累积 */
function safeEqual(a, b){
  const A = new TextEncoder().encode(String(a));
  const B = new TextEncoder().encode(String(b));
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) diff |= (A[i] || 0) ^ (B[i] || 0);
  return diff === 0;
}

export async function onRequestPost({ request, env }){
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (!allowed(ip)){
    return json({ ok: false, error: '试错太多次了，歇 15 分钟再来' }, 429);
  }

  const want = env.ADMIN_PASSWORD;
  if (!want){
    return json({ ok: false, error: '服务端还没设置 ADMIN_PASSWORD，去 Cloudflare 后台配一下' }, 500);
  }

  let password = '';
  try{ password = (await request.json()).password || ''; }catch(e){}

  if (!password){
    noteFail(ip);
    return json({ ok: false, error: '请输入密码' }, 400);
  }
  if (!safeEqual(password, want)){
    noteFail(ip);
    return json({ ok: false, error: '密码不对' }, 401);
  }

  clearFail(ip);
  const token = await sign(env, 30);
  return json({ ok: true, token, days: 30 });
}

/* 别的请求方法一律回 405，别让探测的人瞎猜 */
export async function onRequest({ request }){
  if (request.method === 'POST') return onRequestPost({ request, env: {} });
  return json({ ok: false, error: '只接受 POST' }, 405);
}
