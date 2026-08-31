import { SelectionController } from "./selection-controller.ts";
import { ProtectedSelectionRestorer } from "./protected-selection.ts";

/**
 * 零尺寸的 frame（隐藏的广告、埋点 iframe）里没有可划词的内容，
 * 跳过全部监听器的注册开销。document_idle 时布局已就绪，判断可靠。
 */
function isUsableFrame(): boolean {
  const root = document.documentElement;
  return root.clientWidth > 0 && root.clientHeight > 0;
}

if (isUsableFrame()) {
  new SelectionController().attach();
  new ProtectedSelectionRestorer().attach();
}
