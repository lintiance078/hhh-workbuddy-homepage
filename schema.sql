-- 个人主页 · 博客文章表
-- status: draft（草稿，仅管理员可见）/ published（已发布，所有人可见）/ hidden（已隐藏，仅管理员可见）
CREATE TABLE IF NOT EXISTS posts (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  body     TEXT NOT NULL,
  tags     TEXT DEFAULT '',
  status   TEXT NOT NULL DEFAULT 'draft',
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status  ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated DESC);
