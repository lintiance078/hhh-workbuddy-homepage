-- 个人主页 · 博客文章表
--
-- status:    draft（草稿，仅管理员可见）/ published（已发布，所有人可见）/ hidden（已隐藏，仅管理员可见）
-- pinned:    1 = 置顶（列表里排最前面），0 = 普通
-- shareable: 1 = 允许分享（显示分享按钮），0 = 关闭分享
CREATE TABLE IF NOT EXISTS posts (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  body      TEXT NOT NULL,
  tags      TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'draft',
  pinned    INTEGER NOT NULL DEFAULT 0,
  shareable INTEGER NOT NULL DEFAULT 1,
  created   INTEGER NOT NULL,
  updated   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status  ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated DESC);
CREATE INDEX IF NOT EXISTS idx_posts_pinned  ON posts(pinned DESC, updated DESC);

-- ⚠️ 如果表已经建好了（老库），执行下面两条把新列补上，不用重建表、不丢数据：
--   ALTER TABLE posts ADD COLUMN pinned    INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE posts ADD COLUMN shareable INTEGER NOT NULL DEFAULT 1;
