# Aside 领域词汇表

本项目是 Chrome 术语解释插件 Aside：用户在网页中选中看不懂的技术名词，就地获得专业与通俗两层解释，无需切换页面。使用用户自行配置的 OpenAI 兼容接口。

## 核心概念

| 术语 | 定义 | 所在模块 |
|---|---|---|
| 术语（Term） | 用户选中的、等待解释的短文本；长度 1–60 字、不含换行，超出则只提示不请求 | shared/term.ts |
| 选词会话（Selection Session） | 从用户划选到解释卡片出现的完整决策流程：拖选、键盘选词、提示、关闭、过期响应守卫 | content/session.ts |
| 解释卡片（Explanation Card） | 选区附近浮动的双层解释 UI（专业解释 + 通俗解释），含入口、加载、成功、错误各态与宿主重挂载 | content/ui/overlay.ts |
| 解释协调（Explanation Coordinator） | 后台按标签页与 frame 管理在途解释请求；同一 frame 新请求中止旧请求，避免重复计费，不同 frame 互不影响 | background/explanation-coordinator.ts |
| 配置（Config） | 用户配置的 OpenAI 兼容接口：Base URL、API Key、Model；合法性校验与读路径规范化只在一处 | shared/config.ts |
| 消息契约（Message Contract） | 内容脚本/设置页与后台之间的请求、响应形状、载荷守卫与发送方授权规则，单一文件维护 | shared/messages.ts |
| 连接测试（Connection Test） | 设置页用固定短词验证接口连通与输出结构，并在用户手势中申请该接口 origin 的访问权限 | background/api-client.ts、shared/host-permission.ts |
| 专业解释 / 通俗解释 | 解释卡片的双栏内容：前者给出相对准确的定义，后者用日常语言或类比 | 解释卡片 |
| 恢复划词（Restore Selection） | 设置项，独立存储，默认关闭；开启后可在禁止选择的网页上恢复划词选择 | content/protected-selection.ts |

## 使用约定

- 架构讨论与代码命名统一使用上表术语，不使用「服务」「组件」「边界」等替代词。
- 新增领域概念时先在此登记，再决定模块命名与接缝位置。
