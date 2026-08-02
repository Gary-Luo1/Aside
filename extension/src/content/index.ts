import { SelectionController } from "./selection-controller";
import { requestUiSettings } from "../shared/messages";
import { ProtectedSelectionRestorer } from "./protected-selection";

// 不在受限页面运行（manifest 已限定普通 HTTP/HTTPS），
// 页面结构可能尚未完整，直接挂载选词监听。
new SelectionController().attach();

// 用户在设置中开启后，在禁止选择的页面恢复划词能力（默认关闭）。
// 修改设置后刷新已打开的页面生效。
void requestUiSettings().then((settings) => {
  if (settings.restoreSelection) {
    new ProtectedSelectionRestorer().attach();
  }
});
