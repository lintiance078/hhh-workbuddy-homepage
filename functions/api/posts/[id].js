/* /api/posts/:id
 *
 * GET    —— 读单篇
 *          访客只能读 published；草稿/隐藏只有管理员能读
 * PUT    —— 整篇覆盖（管理员）
 * PATCH  —— 只改状态，{ status: 'draft'|'published'|'hidden' }（管理员）
 * DELETE —— 删除（管理员）
 */
/* 注意路径：本文件在 /api/posts/ 子目录里，_auth.js 在上一层 /api/，
   所以要写 '../_auth.js'。写成 './_auth.js' 本地 wrangler 会报
   Could not resolve，构建直接失败。 */
import { isAdmin, json } from '../_auth.js';

const OK_STATUS = ['draft', 'published', 'hidden'];

function rowToPost(r){
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    status: r.status,
    pinned: !!r.pinned,
    shareable: r.shareable === undefined || r.shareable === null ? true : !!r.shareable,
    created: r.created,
    updated: r.updated
  };
}

function normTags(t){
  if (Array.isArray(t)) return t.map(x => String(x).trim()).filter(Boolean).slice(0, 6).join(',');
  return String(t || '').split(/[,，]/).map(x => x.trim()).filter(Boolean).slice(0, 6).join(',');
}

export async function onRequestGet({ request, env, params }){
  const admin = await isAdmin(request, env);
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(params.id).first();

  if (!row) return json({ ok: false, error: '文章不存在' }, 404);
  if (!admin && row.status !== 'published'){
    return json({ ok: false, error: '文章不存在' }, 404);   /* 不暴露"有这篇但你没权限" */
  }
  return json({ ok: true, post: rowToPost(row) });
}

export async function onRequestPut({ request, env, params }){
  if (!await isAdmin(request, env)) return json({ ok: false, error: '没登录，不能改' }, 401);

  let body = {};
  try{ body = await request.json(); }catch(e){
    return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
  }

  const title = String(body.title || '').trim();
  const text  = String(body.body || '').trim();
  if (!title) return json({ ok: false, error: '标题不能空' }, 400);
  if (!text)  return json({ ok: false, error: '正文不能空' }, 400);

  const status = OK_STATUS.includes(body.status) ? body.status : 'draft';
  const pinned = body.pinned ? 1 : 0;
  const shareable = body.shareable === false ? 0 : 1;
  const now = Date.now();

  const res = await env.DB.prepare(
    'UPDATE posts SET title = ?, body = ?, tags = ?, status = ?, pinned = ?, shareable = ?, updated = ? WHERE id = ?'
  ).bind(title, text, normTags(body.tags), status, pinned, shareable, now, params.id).run();

  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }
  return json({ ok: true, id: params.id, updated: now, status, pinned: !!pinned, shareable: !!shareable });
}

/* 局部更新：状态、置顶、可分享，谁传了就改谁。
   草稿箱里「发布」「隐藏」「退回草稿」、阅读页「置顶」「关闭分享」都走这里。 */
export async function onRequestPatch({ request, env, params }){
  if (!await isAdmin(request, env)) return json({ ok: false, error: '没登录，不能改' }, 401);

  let body = {};
  try{ body = await request.json(); }catch(e){}

  const sets = [];
  const vals = [];

  if (body && body.status !== undefined){
    if (!OK_STATUS.includes(body.status)){
      return json({ ok: false, error: '状态只能是 draft / published / hidden' }, 400);
    }
    sets.push('status = ?');
    vals.push(body.status);
  }

  if (body && body.pinned !== undefined){
    sets.push('pinned = ?');
    vals.push(body.pinned ? 1 : 0);
  }

  if (body && body.shareable !== undefined){
    sets.push('shareable = ?');
    vals.push(body.shareable ? 1 : 0);
  }

  if (!sets.length){
    return json({ ok: false, error: '没有要改的字段（status / pinned / shareable）' }, 400);
  }

  const now = Date.now();
  sets.push('updated = ?');
  vals.push(now);
  vals.push(params.id);

  const res = await env.DB.prepare(
    'UPDATE posts SET ' + sets.join(', ') + ' WHERE id = ?'
  ).bind(...vals).run();

  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }

  /* 把改完的完整状态回给前端，省得它再拉一次 */
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(params.id).first();
  return json({ ok: true, id: params.id, updated: now, post: row ? rowToPost(row) : null });
}

export async function onRequestDelete({ request, env, params }){
  if (!await isAdmin(request, env)) return json({ ok: false, error: '没登录，不能删' }, 401);

  const res = await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(params.id).run();
  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }
  return json({ ok: true, id: params.id });
}
