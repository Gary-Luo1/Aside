# I am Fine

选中教程里的专业名词，不离开页面，就地获得「专业解释」和「通俗解释」两层说明。

面向没有技术基础、但经常阅读技术教程的用户：遇到看不懂的术语时，不再需要复制名词 → 打开搜索或 AI 对话 → 再补一句「请用通俗方式解释」，而是在当前页面一次完成。

## 功能

- 网页划词 → 选区附近出现「解释这个词」入口 → 双栏解释卡片（专业 + 通俗）
- 窄屏自动纵向排列，长文本可展开
- 使用你自己配置的 OpenAI 兼容接口（DeepSeek、通义、智谱、OpenAI 兼容服务等）
- 连接测试、保存、修改与删除配置
- 可选「恢复划词」：在禁止选择的网页（如开启防复制的飞书文档）上按用户手势恢复文本选择，默认关闭
- 隐私优先：只把「你选中的那个词」发送到你自己的接口地址，不读取段落、标题或网址

![解释卡片](docs/visual-evidence/1440x900-success.png)

## 安装

### 方式一：Release 压缩包（推荐）

1. 在 Releases 页面下载最新版的扩展压缩包并解压。
2. 打开 Chrome，访问 `chrome://extensions`，打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的文件夹。

### 方式二：自行构建

```bash
npm install
npm run extension:build
```

构建产物在 `extension/dist/`，按方式一第 2、3 步加载即可。

详细的安装与配置说明见 [docs/install-guide.md](docs/install-guide.md)。

## 配置 AI 接口

点击工具栏的 I am Fine 图标打开设置页，填写三项：

- **API Base URL**：以 `https` 开头的 OpenAI 兼容接口地址（本地调试可用 `http://localhost` / `http://127.0.0.1`）
- **API Key**：向模型厂商申请的密钥，建议使用独立、可撤销、有限额的密钥
- **Model**：模型名称（如 `gpt-4o`、`qwen-plus`），以厂商实际名称为准

点击「测试连接」成功后即可保存使用。

## 隐私与安全

- 插件不扫描页面、不读取选中词以外的内容，不发送页面标题或网址。
- API Key 只保存在浏览器本地存储中，并限制为受信任的扩展上下文读取；任何请求都只发往你自己配置的接口地址。
- 选词、解释、配置相关的安全设计详见 [CONTEXT.md](CONTEXT.md) 与源码。
- AI 生成内容可能不准确，重要信息请进一步核对。

## 开发

```bash
npm run extension:typecheck   # TypeScript 类型检查
npm run extension:test        # 单元 + 集成测试
npm run extension:test:e2e    # 端到端测试（有头浏览器，需图形环境；CI 用 xvfb 虚拟显示器）
npm run extension:build       # 构建扩展（输出 extension/dist）
npm run extension:check       # 全量检查：类型 + 测试 + E2E + 构建
```

测试覆盖：单元/集成 107 项、端到端 36 项（真实鼠标拖选、键盘选词、飞书类页面、密钥隔离等）。

## 许可证

[MIT](LICENSE)
