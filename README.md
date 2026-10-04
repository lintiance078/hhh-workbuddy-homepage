# hhh · 个人主页

林天策的个人主页 + 博客 + 工具箱，单页应用部署在 Cloudflare Pages 上。

- **访客**：只能看已发布的文章，看不到任何编辑入口
- **管理员**：从页脚「建站天数」的神秘入口登录后可写、可改、可删
- **断网/本地**：自动降级成本地模式，写的东西先存本机，联网登录后可以一键上传

---

## 一、项目结构

```
hhh-workbuddy-homepage/
├── public/
│   └── index.html              前端（单文件，样式+逻辑全在里面）
├── functions/
│   └── api/
│       ├── _auth.js            签发/校验 token（HMAC-SHA256）
│       ├── login.js            POST /api/login      密码换 token
│       ├── posts.js            GET/POST /api/posts  列表 / 新建（支持批量）
│       └── posts/[id].js       GET/PUT/PATCH/DELETE 单篇操作
├── schema.sql                  D1 建表语句
├── wrangler.toml               Cloudflare Pages 配置
└── README.md                   本文件
```

---

## 二、部署步骤

### 1. 建 D1 数据库

Cloudflare 后台 → **Workers & Pages → D1 → Create database**，名字填 `hhh-homepage-db`。

建好后把 **Database ID** 复制出来。

### 2. 建表

在 D1 控制台 → **Console** 标签，把 `schema.sql` 的内容整段粘进去执行。

或者用命令行：

```bash
npx wrangler d1 execute hhh-homepage-db --remote --file=./schema.sql
```

### 3. 改 wrangler.toml

把 `database_id` 换成上面复制的真实 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "hhh-homepage-db"
database_id = "这里填你的真实 ID"
```

### 4. 推到 GitHub

```bash
git init
git add .
git commit -m "个人主页 + 后端"
git branch -M main
git remote add origin https://github.com/lintiance078/hhh-workbuddy-homepage.git
git push -u origin main
```

### 5. Cloudflare Pages 连接仓库

Cloudflare 后台 → **Workers & Pages → Create → Pages → Connect to Git**，
选 `hhh-workbuddy-homepage` 仓库。

构建配置：

| 项 | 值 |
|---|---|
| Framework preset | None |
| Build command | （留空） |
| Build output directory | `public` |

### 6. 配环境变量（关键）

Pages 项目 → **Settings → Environment variables**，加两个：

| 变量名 | 值 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 你自己定的密码 | **必填**。登录用的密码 |
| `SECRET` | 一串随机字符 | 选填。不填就用密码派生，填了更安全；**改了会导致已登录的 token 全部失效** |

> ⚠️ 密码只存在这里，代码里一个字都没有。忘了密码就来这儿改。

### 7. 绑定 D1

Pages 项目 → **Settings → Functions → D1 database bindings**：

- Variable name: `DB`
- D1 database: `hhh-homepage-db`

**改完这两处记得重新部署一次**（Deployments → 最新那条 → Retry deployment）。

---

## 三、怎么用

### 登录（神秘入口）

1. 滚到页面最底下，那一行小字里的 **「已运行 855 天」** 的 **数字**
2. **单击 5 下** → 屏幕飘一句「触发了神秘入口…」
3. **再单击 2 下** → 数字原地变成密码框
4. 输入密码 → 回车

> 分两段是为了防误触，页面上没有任何登录按钮。
> 想取消就按 `Esc`，数字会回来。

### 文章三种状态

| 状态 | 谁看得见 | 怎么用 |
|---|---|---|
| **草稿** | 只有你 | 编辑器点「存草稿」 |
| **已发布** | 所有人 | 编辑器点「发布文章」 |
| **已隐藏** | 只有你 | 编辑器点「隐藏」，或阅读页点「隐藏」 |

阅读页顶部有「转草稿 / 隐藏 / 发布」三个按钮，点一下直接切状态。

### 草稿箱

登录后导航栏会多出一个 **草稿箱** 标签，里面上下两块：

- **☁ 线上文章** —— 存在 D1 里的全部文章（含草稿、隐藏），每条能直接切状态、编辑、删除
- **▤ 本地草稿** —— 这台电脑上断网 / 没登录时写的东西，能逐条「上传到线上」，或「全部上传」

### 断网也能写

在没网、或者本地双击 `index.html` 打开的时候：

- 页面会自动进入**本地模式**（探测 `/api/posts` 不通就降级）
- 这时写文章直接存进浏览器本地，不需要登录
- 回到线上环境登录后，去草稿箱的「本地草稿」把它们传上去

---

## 四、安全说明

| 项 | 做法 |
|---|---|
| 密码存放 | 只在 Cloudflare 环境变量，代码和前端都不含明文 |
| 登录凭证 | HMAC-SHA256 签名 token，30 天过期，改 `SECRET` 可全部作废 |
| 密码比对 | 定长比较，不会因为"前几位对了"而变快 |
| 暴力破解 | 同一 IP 15 分钟内错 8 次直接挡 |
| 文章隔离 | 访客请求 `status != 'published'` 的文章一律返回 404，不暴露"有这篇但你没权限" |
| 前端隐藏 | 编辑按钮靠 `body.is-admin` 控制 CSS 显隐；**真正的防线在后端**，前端藏起来只是不让访客看见 |

> ⚠️ **前端隐藏按钮 ≠ 安全**。真正拦住人的是 `functions/api/` 里每个写操作都验了 token。
> 就算有人 F12 把按钮改出来，点下去后端也会回 401。

---

## 五、本地开发

```bash
# 装依赖
npm install -g wrangler

# 本地跑（带 D1 模拟）
wrangler pages dev public --d1=DB

# 或者只跑前端，看静态效果
# 直接双击 public/index.html 即可，会自动进本地模式
```

---

## 六、常见问题

**Q：登录后刷新页面，还要重新登吗？**
不用。token 存在 `localStorage`，30 天内有效。

**Q：密码改了，已登录的设备会怎样？**
`ADMIN_PASSWORD` 改了但 `SECRET` 没改的话，老 token 还能用到过期。想立刻全部踢掉，就把 `SECRET` 也换一个新的。

**Q：本地草稿会丢吗？**
存在浏览器 `localStorage` 里。**换电脑、清缓存、换浏览器都会没**。重要内容记得及时上传到线上。

**Q：图片放哪？**
`public/` 目录下。`avatar.png`（头像）、`weixin_qr.png` / `alipay_qr.png`（赞赏码）是可选的，不放就用占位显示，不会有问题。
