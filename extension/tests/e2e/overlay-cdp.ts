import { expect, type CDPSession, type Frame, type Page } from "@playwright/test";

type CdpNode = {
  nodeId?: number;
  backendNodeId?: number;
  nodeName?: string;
  localName?: string;
  nodeValue?: string;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
  contentDocument?: CdpNode;
  frameId?: string;
};

type FrameTree = {
  frame: { id: string; name?: string; url: string };
  childFrames?: FrameTree[];
};

const sessions = new WeakMap<object, CDPSession>();
const isolatedFrameSessions = new WeakSet<CDPSession>();

function isPage(target: Page | Frame): target is Page {
  return "mainFrame" in target;
}

function pageOf(target: Page | Frame): Page {
  return isPage(target) ? target : target.page();
}

function frameOf(target: Page | Frame): Frame {
  return isPage(target) ? target.mainFrame() : target;
}

async function sessionOf(target: Page | Frame): Promise<CDPSession> {
  const page = pageOf(target);
  const frame = frameOf(target);
  if (frame === page.mainFrame() || !isIsolatedOopif(frame, page)) {
    return pageSession(page);
  }
  const existing = sessions.get(frame);
  if (existing) return existing;
  const session = await page.context().newCDPSession(frame);
  await session.send("DOM.enable");
  await session.send("Page.enable");
  isolatedFrameSessions.add(session);
  sessions.set(frame, session);
  return session;
}

function isIsolatedOopif(frame: Frame, page: Page): boolean {
  try {
    const frameUrl = new URL(frame.url());
    if (frameUrl.protocol !== "http:" && frameUrl.protocol !== "https:") return false;
    return frameUrl.origin !== new URL(page.url()).origin;
  } catch {
    return false;
  }
}

async function pageSession(page: Page): Promise<CDPSession> {
  const existing = sessions.get(page);
  if (existing) return existing;
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("Page.enable");
  sessions.set(page, session);
  return session;
}

function findFrameId(tree: FrameTree, frame: Frame, page: Page): string | undefined {
  if (frame === page.mainFrame()) return tree.frame.id;
  const name = frame.name();
  const url = frame.url();
  const walk = (node: FrameTree): string | undefined => {
    if (name && node.frame.name === name) return node.frame.id;
    if (!name && node.frame.url === url) return node.frame.id;
    for (const child of node.childFrames ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(tree);
}

function attrMap(attributes: string[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!attributes) return map;
  for (let i = 0; i < attributes.length; i += 2) {
    map[attributes[i] ?? ""] = attributes[i + 1] ?? "";
  }
  return map;
}

async function querySelector(session: CDPSession, nodeId: number, selector: string): Promise<number> {
  const result = (await session.send("DOM.querySelector", { nodeId, selector })) as { nodeId: number };
  return result.nodeId;
}

async function shadowRootId(session: CDPSession, hostId: number): Promise<number | null> {
  const { node } = (await session.send("DOM.describeNode", {
    nodeId: hostId,
    depth: 1,
    pierce: true,
  })) as { node: CdpNode };
  const shadowId = node.shadowRoots?.[0]?.nodeId;
  return shadowId ?? null;
}

async function querySelectorAll(session: CDPSession, nodeId: number, selector: string): Promise<number[]> {
  const result = (await session.send("DOM.querySelectorAll", { nodeId, selector })) as { nodeIds: number[] };
  return result.nodeIds ?? [];
}

async function overlayRootId(target: Page | Frame): Promise<{ session: CDPSession; page: Page; rootId: number } | null> {
  const page = pageOf(target);
  const frame = frameOf(target);
  const session = await sessionOf(target);
  const isolated = isolatedFrameSessions.has(session);
  const { root } = (await session.send("DOM.getDocument", { depth: -1, pierce: true })) as { root: CdpNode };
  let hostId: number | undefined;
  if (isolated) {
    hostId = findOverlayHostInTree(root);
  } else {
    const { frameTree } = (await session.send("Page.getFrameTree")) as { frameTree: FrameTree };
    const frameId = findFrameId(frameTree, frame, page);
    if (!frameId) return null;
    hostId = findOverlayHostNodeId(root, frameId, frameTree.frame.id);
  }
  if (!hostId) return null;
  const rootId = await shadowRootId(session, hostId);
  if (!rootId) return null;
  return { session, page, rootId };
}

function findOverlayHostInTree(node: CdpNode): number | undefined {
  const attrs = attrMap(node.attributes);
  if (attrs.id === "i-am-fine-overlay" && node.nodeId) return node.nodeId;
  if (node.contentDocument) {
    const found = findOverlayHostInTree(node.contentDocument);
    if (found) return found;
  }
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = findOverlayHostInTree(child);
    if (found) return found;
  }
  return undefined;
}

function findOverlayHostNodeId(node: CdpNode, wantedFrameId: string, currentFrameId: string): number | undefined {
  const attrs = attrMap(node.attributes);
  if (attrs.id === "i-am-fine-overlay" && node.nodeId && currentFrameId === wantedFrameId) {
    return node.nodeId;
  }
  if (node.contentDocument) {
    const childFrameId = node.frameId ?? currentFrameId;
    const found = findOverlayHostNodeId(node.contentDocument, wantedFrameId, childFrameId);
    if (found) return found;
  }
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = findOverlayHostNodeId(child, wantedFrameId, currentFrameId);
    if (found) return found;
  }
  return undefined;
}

async function nodeText(session: CDPSession, nodeId: number): Promise<string> {
  const { object } = (await session.send("DOM.resolveNode", { nodeId })) as {
    object: { objectId?: string };
  };
  expect(object.objectId).toBeTruthy();
  const { result } = (await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: "function() { return this.innerText ?? this.textContent ?? \"\"; }",
    returnByValue: true,
  })) as { result: { value?: string } };
  return result.value ?? "";
}

async function clickNode(session: CDPSession, page: Page, frame: Frame, nodeId: number): Promise<void> {
  const { model } = (await session.send("DOM.getBoxModel", { nodeId })) as {
    model: { content: number[] };
  };
  const quad = model.content;
  let x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  let y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  if (isolatedFrameSessions.has(session)) {
    const iframe = await frame.frameElement();
    const box = await iframe.boundingBox();
    expect(box, "iframe 不在视口内").not.toBeNull();
    const inset = await iframe.evaluate((el) => ({
      left: (el as HTMLIFrameElement).clientLeft,
      top: (el as HTMLIFrameElement).clientTop,
    }));
    x += box!.x + inset.left;
    y += box!.y + inset.top;
  }
  await page.mouse.click(x, y);
}

async function findButtonNode(
  overlay: { session: CDPSession; rootId: number },
  name: string,
): Promise<number | null> {
  const nodeIds = await querySelectorAll(overlay.session, overlay.rootId, "button");
  for (const nodeId of nodeIds) {
    const { node } = (await overlay.session.send("DOM.describeNode", { nodeId, depth: 0 })) as { node: CdpNode };
    const attrs = attrMap(node.attributes);
    const text = (await nodeText(overlay.session, nodeId)).trim();
    const accessible = (attrs["aria-label"] ?? "").trim();
    if (text === name || accessible === name) return nodeId;
  }
  return null;
}

export async function overlayButtonCount(target: Page | Frame, name: string): Promise<number> {
  const overlay = await overlayRootId(target);
  if (!overlay) return 0;
  return (await findButtonNode(overlay, name)) ? 1 : 0;
}

export async function expectOverlayButtonVisible(target: Page | Frame, name: string): Promise<void> {
  await expect.poll(async () => overlayButtonCount(target, name)).toBe(1);
}

export async function expectOverlayButtonHidden(target: Page | Frame, name: string): Promise<void> {
  await expect.poll(async () => overlayButtonCount(target, name)).toBe(0);
}

export async function clickOverlayButton(target: Page | Frame, name: string): Promise<void> {
  await expectOverlayButtonVisible(target, name);
  const overlay = await overlayRootId(target);
  expect(overlay).not.toBeNull();
  const nodeId = await findButtonNode(overlay!, name);
  expect(nodeId, `未找到 overlay 按钮：${name}`).toBeTruthy();
  await clickNode(overlay!.session, overlay!.page, frameOf(target), nodeId as number);
}

export async function overlayButtonBox(
  target: Page | Frame,
  name: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const overlay = await overlayRootId(target);
  if (!overlay) return null;
  const nodeId = await findButtonNode(overlay, name);
  if (!nodeId) return null;
  const { model } = (await overlay.session.send("DOM.getBoxModel", { nodeId })) as {
    model: { content: number[]; width: number; height: number };
  };
  const quad = model.content;
  const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
  const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
  return { x, y, width: model.width, height: model.height };
}

export async function focusOverlayButton(target: Page | Frame, name: string): Promise<void> {
  await expectOverlayButtonVisible(target, name);
  const overlay = await overlayRootId(target);
  expect(overlay).not.toBeNull();
  const nodeId = await findButtonNode(overlay!, name);
  expect(nodeId).toBeTruthy();
  await overlay!.session.send("DOM.focus", { nodeId });
}

export async function overlayDialogCount(target: Page | Frame): Promise<number> {
  const overlay = await overlayRootId(target);
  if (!overlay) return 0;
  const nodeId = await querySelector(overlay.session, overlay.rootId, '[role="dialog"]');
  return nodeId ? 1 : 0;
}

export async function expectOverlayDialogVisible(target: Page | Frame): Promise<void> {
  await expect.poll(async () => overlayDialogCount(target)).toBe(1);
}

export async function expectOverlayDialogHidden(target: Page | Frame): Promise<void> {
  await expect.poll(async () => overlayDialogCount(target)).toBe(0);
}

export async function overlayDialogText(target: Page | Frame): Promise<string> {
  const overlay = await overlayRootId(target);
  if (!overlay) return "";
  const nodeId = await querySelector(overlay.session, overlay.rootId, '[role="dialog"]');
  if (!nodeId) return "";
  return nodeText(overlay.session, nodeId);
}

export async function expectOverlayDialogText(target: Page | Frame, text: string): Promise<void> {
  await expect.poll(async () => overlayDialogText(target)).toContain(text);
}

export async function overlayHintCount(target: Page | Frame): Promise<number> {
  const overlay = await overlayRootId(target);
  if (!overlay) return 0;
  const nodeId = await querySelector(overlay.session, overlay.rootId, ".hint");
  return nodeId ? 1 : 0;
}

export async function expectOverlayHintVisible(target: Page | Frame, text: string): Promise<void> {
  await expect.poll(async () => {
    const overlay = await overlayRootId(target);
    if (!overlay) return "";
    const nodeId = await querySelector(overlay.session, overlay.rootId, ".hint");
    if (!nodeId) return "";
    return nodeText(overlay.session, nodeId);
  }).toContain(text);
}

export async function overlayDialogBox(
  target: Page | Frame,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const overlay = await overlayRootId(target);
  if (!overlay) return null;
  const nodeId = await querySelector(overlay.session, overlay.rootId, '[role="dialog"]');
  if (!nodeId) return null;
  const { model } = (await overlay.session.send("DOM.getBoxModel", { nodeId })) as {
    model: { content: number[]; width: number; height: number };
  };
  const quad = model.content;
  const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
  const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
  return { x, y, width: model.width, height: model.height };
}

export async function overlayDialogEvaluate<T>(
  target: Page | Frame,
  fn: (el: Element) => T,
): Promise<T> {
  const overlay = await overlayRootId(target);
  expect(overlay).not.toBeNull();
  const nodeId = await querySelector(overlay!.session, overlay!.rootId, '[role="dialog"]');
  expect(nodeId).toBeTruthy();
  const { object } = (await overlay!.session.send("DOM.resolveNode", { nodeId })) as {
    object: { objectId?: string };
  };
  const { result, exceptionDetails } = (await overlay!.session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: `function() { return (${fn.toString()})(this); }`,
    returnByValue: true,
  })) as { result: { value?: T }; exceptionDetails?: { text?: string } };
  if (exceptionDetails) {
    throw new Error(exceptionDetails.text ?? "overlayDialogEvaluate failed");
  }
  return result.value as T;
}

/** 对目标 frame 建立 CDP 会话后点击 closed shadow 内入口。 */
export async function clickOverlayNearSelection(frame: Frame): Promise<void> {
  await clickOverlayButton(frame, "解释这个词");
}
