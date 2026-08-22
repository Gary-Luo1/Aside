import { SelectionController } from "./selection-controller";
import { ProtectedSelectionRestorer } from "./protected-selection";
import { isRestoreSelectionChangedMessage, requestSettings } from "../shared/messages";

new SelectionController().attach();

const restorer = new ProtectedSelectionRestorer();

function applyRestoreSelection(enabled: boolean): void {
  if (enabled) restorer.attach();
  else restorer.detach();
}

void requestSettings().then((settings) => {
  applyRestoreSelection(settings.restoreSelection);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isRestoreSelectionChangedMessage(message)) {
    applyRestoreSelection(message.restoreSelection);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  void requestSettings().then((settings) => {
    applyRestoreSelection(settings.restoreSelection);
  });
});
