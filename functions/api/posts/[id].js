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
  const now = Date.now();

  const res = await env.DB.prepare(
    'UPDATE posts SET title = ?, body = ?, tags = ?, status = ?, updated = ? WHERE id = ?'
  ).bind(title, text, normTags(body.tags), status, now, params.id).run();

  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }
  return json({ ok: true, id: params.id, updated: now, status });
}

/* 只改状态：草稿箱里「发布」「隐藏」「退回草稿」走这里 */
export async function onRequestPatch({ request, env, params }){
  if (!await isAdmin(request, env)) return json({ ok: false, error: '没登录，不能改' }, 401);

  let body = {};
  try{ body = await request.json(); }catch(e){}

  const status = body && body.status;
  if (!OK_STATUS.includes(status)){
    return json({ ok: false, error: '状态只能是 draft / published / hidden' }, 400);
  }

  const now = Date.now();
  const res = await env.DB.prepare(
    'UPDATE posts SET status = ?, updated = ? WHERE id = ?'
  ).bind(status, now, params.id).run();

  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }
  return json({ ok: true, id: params.id, status, updated: now });
}

export async function onRequestDelete({ request, env, params }){
  if (!await isAdmin(request, env)) return json({ ok: false, error: '没登录，不能删' }, 401);

  const res = await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(params.id).run();
  if (!res.meta || res.meta.changes === 0){
    return json({ ok: false, error: '文章不存在' }, 404);
  }
  return json({ ok: true, id: params.id });
}
