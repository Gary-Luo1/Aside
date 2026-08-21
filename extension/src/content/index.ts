import { SelectionController } from "./selection-controller";
import { ProtectedSelectionRestorer } from "./protected-selection";
import { requestSettings } from "../shared/messages";

new SelectionController().attach();

void requestSettings().then((settings) => {
  if (settings.restoreSelection) {
    new ProtectedSelectionRestorer().attach();
  }
});
