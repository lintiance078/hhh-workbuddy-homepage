/* /api/posts
 *
 * GET  —— 文章列表
 *   · 访客（没带合法 token）：只返回 status = 'published' 的，正文一起给
 *   · 管理员：全部返回（含 draft / hidden），带 status 字段
 *
 * POST —— 新建文章（仅管理员）
 *   请求体：{ title, body, tags: [] | "", status: 'draft'|'published'|'hidden' }
 *   另外支持批量：{ items: [ {title, body, ...}, ... ] }，一次传多篇
 *   批量主要是给「本地草稿箱 → 一键上传」用的。
 */
import { isAdmin, json } from './_auth.js';

const OK_STATUS = ['draft', 'published', 'hidden'];

function normTags(t){
  if (Array.isArray(t)) return t.map(x => String(x).trim()).filter(Boolean).slice(0, 6).join(',');
  return String(t || '').split(/[,，]/).map(x => x.trim()).filter(Boolean).slice(0, 6).join(',');
}

function rowToPost(r, withStatus){
  const p = {
    id: r.id,
    title: r.title,
    body: r.body,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    created: r.created,
    updated: r.updated
  };
  if (withStatus) p.status = r.status;
  return p;
}

export async function onRequestGet({ request, env }){
  const admin = await isAdmin(request, env);

  const sql = admin
    ? 'SELECT id, title, body, tags, status, created, updated FROM posts ORDER BY updated DESC'
    : "SELECT id, title, body, tags, status, created, updated FROM posts WHERE status = 'published' ORDER BY updated DESC";

  const { results } = await env.DB.prepare(sql).all();
  return json({
    ok: true,
    admin,
    posts: (results || []).map(r => rowToPost(r, admin))
  });
}

export async function onRequestPost({ request, env }){
  if (!await isAdmin(request, env)){
    return json({ ok: false, error: '没登录，不能写' }, 401);
  }

  let body = {};
  try{ body = await request.json(); }catch(e){
    return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
  }

  /* 批量上传：本地草稿箱一次传多篇 */
  const items = Array.isArray(body.items) ? body.items : [body];
  if (!items.length) return json({ ok: false, error: '没有要保存的文章' }, 400);

  const now = Date.now();
  const stmts = [];
  const saved = [];

  for (let i = 0; i < items.length; i++){
    const it = items[i] || {};
    const title = String(it.title || '').trim();
    const text  = String(it.body || '').trim();
    if (!title || !text) continue;              /* 空的跳过，不报错打断整批 */

    const status = OK_STATUS.includes(it.status) ? it.status : 'draft';
    const id     = String(it.id || ('p' + (now + i) + '-' + Math.random().toString(36).slice(2, 7)));
    const tags   = normTags(it.tags);
    const created = Number(it.created) || now;
    const updated = Number(it.updated) || now;

    /* INSERT OR REPLACE：本地草稿重复上传不会炸主键，直接覆盖 */
    stmts.push(env.DB.prepare(
      'INSERT OR REPLACE INTO posts (id, title, body, tags, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, text, tags, status, created, updated));

    saved.push({ id, title, status });
  }

  if (!stmts.length) return json({ ok: false, error: '标题或正文是空的' }, 400);

  await env.DB.batch(stmts);
  return json({ ok: true, saved });
}
