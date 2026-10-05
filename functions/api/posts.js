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
  /* pinned / shareable 对访客也要给：访客要靠 pinned 排序、
     靠 shareable 决定显不显示分享按钮。这两个不算敏感信息。 */
  p.pinned = !!r.pinned;
  p.shareable = r.shareable === undefined || r.shareable === null ? true : !!r.shareable;
  if (withStatus) p.status = r.status;
  return p;
}

export async function onRequestGet({ request, env }){
  const admin = await isAdmin(request, env);

  /* 排序：置顶的在最前，然后按更新时间倒序。
     status 列两条 SQL 都取——非管理员那条也要，rowToPost 靠它配合 withStatus，
     之前漏取过一次，导致非法 token 时草稿正文被漏出去。 */
  const cols = 'id, title, body, tags, status, pinned, shareable, created, updated';
  const sql = admin
    ? 'SELECT ' + cols + ' FROM posts ORDER BY pinned DESC, updated DESC'
    : "SELECT " + cols + " FROM posts WHERE status = 'published' ORDER BY pinned DESC, updated DESC";

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
    /* 置顶 / 可分享：默认不置顶、允许分享 */
    const pinned    = it.pinned ? 1 : 0;
    const shareable = it.shareable === false ? 0 : 1;

    /* INSERT OR REPLACE：本地草稿重复上传不会炸主键，直接覆盖 */
    stmts.push(env.DB.prepare(
      'INSERT OR REPLACE INTO posts (id, title, body, tags, status, pinned, shareable, created, updated) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, text, tags, status, pinned, shareable, created, updated));

    saved.push({ id, title, status, pinned: !!pinned, shareable: !!shareable });
  }

  if (!stmts.length) return json({ ok: false, error: '标题或正文是空的' }, 400);

  await env.DB.batch(stmts);
  return json({ ok: true, saved });
}
