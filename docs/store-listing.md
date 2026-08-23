# Chrome 网上应用店上架说明（Aside）

面向会自行配置模型接口的用户。单用途：网页划词后给出专业/通俗两层解释。

隐私政策（提交时填写公开 URL，需先把本仓库推到 GitHub）：
https://github.com/Gary-Luo1/Aside/blob/main/docs/privacy.md

## 权限说明（审核回复可直接用）

| 权限 | 为什么需要 | 如何最小使用 |
|---|---|---|
| `storage` | 在本机保存用户填写的接口地址、密钥和模型名称 | 仅扩展受信任上下文可读；内容脚本读不到密钥 |
| `optional_host_permissions`（https 与本机 http） | 后台要把解释请求发到用户填写的接口 | 安装时不授权任何网站。用户点击「测试连接」时，只申请该 Base URL 的 origin |
| 内容脚本匹配 `http(s)://*/*` | 在任意普通教程页感知划词 | 不扫描整页、不读取 URL/标题；选区出现前不创建卡片宿主；卡片字体不走 web_accessible_resources |

不使用：remote code、`<all_urls>` 必选主机权限、`web_accessible_resources`、自有服务器。

## 截图建议

仓库已有端到端视觉证据，提交时可裁切/导出为商店要求的 1280×800 或 640×400：

| 商店槽位 | 源文件 |
|---|---|
| 设置（空） | `docs/visual-evidence/options-1280x720-empty.png` |
| 设置（已配置） | `docs/visual-evidence/options-1280x720-configured.png` |
| 划词成功 | `docs/visual-evidence/1440x900-success.png` |
| 窄屏 | `docs/visual-evidence/600x900-narrow-expanded.png` |
| 未配置 | `docs/visual-evidence/unconfigured.png` |
| 错误 | `docs/visual-evidence/error.png` |
| 小宣传图 440×280 | `docs/store/small-promo-440x280.png` |

## 商店文案草稿

**简短介绍**  
在网页里划词，就地看到专业和通俗两层解释。使用你自己的模型接口。

**详细介绍**  
Aside 给经常读网页、又不想为了一个词切走页面的人使用。划一个词，点「解释这个词」，旁边出现专业解释和通俗解释。请求里只有你选中的那几个字，直接发到你填写的接口。密钥和查询内容不会经过插件作者。
