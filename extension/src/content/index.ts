import { SelectionController } from "./selection-controller";
import { ProtectedSelectionRestorer } from "./protected-selection";

// 不在受限页面运行（manifest 已限定普通 HTTP/HTTPS），
// 页面结构可能尚未完整，直接挂载选词监听。
new SelectionController().attach();
new ProtectedSelectionRestorer().attach();
