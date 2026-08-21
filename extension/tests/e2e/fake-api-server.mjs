import { createServer } from "node:http";

const PORT = 8787;
let lastRequest = null;
let requestCount = 0;
let nextStatus = 200;

const TUTORIAL_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>示例教程：HTTP API 入门</title>
    <style>
      body { font-family: sans-serif; max-width: 720px; margin: 40px auto; line-height: 1.8; }
      article { padding: 20px; }
      .very-high-z-index { position: relative; z-index: 9999999; }
    </style>
  </head>
  <body>
    <h1>HTTP API 教程</h1>
    <article>
      <p>API（应用程序编程接口）是一组约定，用于规定不同软件之间如何交换数据。</p>
      <p>算法是解决某类问题的一组明确步骤。</p>
      <p>数据库是存储和管理数据的系统。</p>
      <p>云计算通过网络按需提供计算能力。</p>
      <p class="very-high-z-index">开源是指源代码按许可证公开。</p>
      <p>大模型通常指使用海量数据训练的机器学习模型。</p>
      <p>浏览器插件是可以扩展浏览器能力的独立程序。</p>
      <p>加密是把明文转换成密文以保护数据的过程。</p>
      <p>缓存是临时保存数据以加快后续访问速度的机制。</p>
      <p>数据库索引是加速数据查询的一种数据结构。</p>
      <p>负载均衡把请求分散到多台服务器以提升可用性。</p>
      <p>数据库连接池是一种在应用启动时预先创建并维护一组数据库连接对象的机制，用于在请求期间复用连接以减少频繁建立和销毁连接的开销，同时需要处理连接数量限制与超时回收问题。</p>
    </article>
  </body>
</html>`;

const PROTECTED_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>受保护教程页</title>
    <style>
      body { font-family: sans-serif; max-width: 720px; margin: 40px auto; line-height: 1.8; }
      .protected { user-select: none; -webkit-user-select: none; }
    </style>
  </head>
  <body>
    <h1>受保护教程页</h1>
    <article>
      <p class="protected">加密是把明文转换成密文以保护数据的过程。</p>
      <p class="protected">缓存是临时保存数据以加快后续访问速度的机制。</p>
      <div class="protected">
        <button id="protected-action" type="button">受保护按钮</button>
      </div>
    </article>
    <script>
      document.querySelector("#protected-action").addEventListener("click", (event) => {
        event.currentTarget.dataset.clicked = "true";
      });
    </script>
  </body>
</html>`;

const EDITOR_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>编辑器风格页面</title>
    <style>
      body { font-family: sans-serif; max-width: 720px; margin: 40px auto; line-height: 1.8; }
    </style>
  </head>
  <body>
    <h1>编辑器风格页面</h1>
    <article id="doc">
      <p>算法是解决某类问题的一组明确步骤。</p>
    </article>
    <script>
      // 模拟飞书编辑器：点击内容区外的任意位置会清空选区
      document.addEventListener(
        "pointerdown",
        (e) => {
          if (!e.target.closest("#doc")) window.getSelection()?.removeAllRanges();
        },
        true,
      );
    </script>
  </body>
</html>`;

const CAPTURE_STOP_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>事件拦截页面</title>
  </head>
  <body>
    <h1>事件拦截页面</h1>
    <article>
      <p>算法是解决某类问题的一组明确步骤。</p>
    </article>
    <script>
      // 模拟页面在 document 捕获阶段吞掉所有点击
      document.addEventListener(
        "click",
        (e) => {
          e.stopImmediatePropagation();
          e.preventDefault();
        },
        true,
      );
    </script>
  </body>
</html>`;

const FRAME_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>嵌入教程帧</title>
    <style>
      body { font-family: sans-serif; min-width: 360px; margin: 20px; line-height: 1.8; }
    </style>
  </head>
  <body>
    <h2>嵌入教程帧</h2>
    <p>算法是解决某类问题的一组明确步骤。</p>
    <p>缓存是临时保存数据以加快后续访问速度的机制。</p>
  </body>
</html>`;

const NESTED_FRAME_HTML = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>嵌套帧容器</title></head>
  <body>
    <h2>嵌套帧容器</h2>
    <iframe name="nested-inner-frame" id="nested-inner-frame" src="/frame.html" title="嵌套内容"></iframe>
  </body>
</html>`;

const FRAMES_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>多帧教程页</title>
    <style>
      body { font-family: sans-serif; margin: 20px; }
      iframe { display: block; width: 520px; height: 180px; margin: 12px 0; border: 1px solid #999; }
    </style>
  </head>
  <body>
    <h1>多帧教程页</h1>
    <iframe name="same-origin-frame" id="same-origin-frame" src="/frame.html" title="同源帧"></iframe>
    <iframe name="cross-origin-frame" id="cross-origin-frame" src="http://localhost:8787/frame.html" title="跨源帧"></iframe>
    <iframe name="nested-frame" id="nested-frame" src="/nested-frame.html" title="嵌套帧"></iframe>
    <iframe name="data-frame" id="data-frame" src="data:text/html,%3Cp%3E算法%3C%2Fp%3E" title="特殊来源帧"></iframe>
  </body>
</html>`;

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && req.url === "/reset") {
    lastRequest = null;
    requestCount = 0;
    nextStatus = 200;
    json(res, 200, {});
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/set-next-status")) {
    const code = Number(new URL(req.url, "http://x").searchParams.get("code") ?? 200);
    nextStatus = code;
    json(res, 200, { nextStatus });
    return;
  }
  if (req.method === "GET" && req.url === "/last-request") {
    json(res, 200, { lastRequest, requestCount });
    return;
  }
  if (req.method === "GET" && req.url === "/tutorial.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(TUTORIAL_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/protected.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PROTECTED_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/editor.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(EDITOR_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/capture-stop.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(CAPTURE_STOP_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/frames.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(FRAMES_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/frame.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(FRAME_HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/nested-frame.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(NESTED_FRAME_HTML);
    return;
  }

  if (req.method === "POST" && req.url.endsWith("/chat/completions")) {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      requestCount += 1;
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      lastRequest = body;
      const statusToUse = nextStatus;
      nextStatus = 200;
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const userMessage = messages.find((m) => m.role === "user");
      const userText = typeof userMessage?.content === "string" ? userMessage.content : "";
      const isolated = /<<<TERM\s*([\s\S]*?)\s*TERM>>>/.exec(userText);
      const term = (isolated?.[1] ?? "").trim() || userText.replace(/^请解释术语：/, "");

      const authorization = req.headers.authorization ?? "";
      if (authorization.includes("sk-401")) {
        json(res, 401, { error: { message: "invalid key" } });
        return;
      }
      if (statusToUse !== 200) {
        json(res, statusToUse, { error: { message: "forced status" } });
        return;
      }
      if (term === "云计算") {
        const longText =
          "云计算的专业解释：通过网络按需提供计算能力、存储空间和软件服务的一种资源使用模式，" +
          "由大量数据中心和虚拟化技术支撑，用户按实际用量付费，无需自行维护物理服务器。" +
          "通俗解释：像用自来水一样，你不用自己挖井建水厂，需要时打开水龙头，按用量付费。" +
          "这是一个用于验证长文本展开的补充说明，实际使用时这里会显示模型生成的内容。";
        json(res, 200, {
          choices: [{ message: { content: JSON.stringify({ professional: longText, plain: longText }) } }],
        });
        return;
      }
      if (term === "缓存") {
        setTimeout(() => {
          json(res, 200, {
            choices: [{ message: { content: JSON.stringify({ professional: "缓存的慢响应定义", plain: "缓存的慢响应类比" }) } }],
          });
        }, 1200);
        return;
      }
      if (userText.includes("__status_401")) {
        json(res, 401, { error: { message: "invalid key" } });
        return;
      }
      if (userText.includes("__slow")) {
        setTimeout(() => {
          json(res, 200, {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    professional: `${term} 的专业解释（慢响应）`,
                    plain: `${term} 的通俗解释`,
                  }),
                },
              },
            ],
          });
        }, 1200);
        return;
      }
      json(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                professional: `${term} 的专业解释：一组明确约定。`,
                plain: `${term} 的通俗解释：像点餐窗口一样。`,
              }),
            },
          },
        ],
      });
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake-api-server listening on ${PORT}`);
});
