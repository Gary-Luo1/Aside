import { SelectionController } from "./selection-controller";
import { ProtectedSelectionRestorer } from "./protected-selection";

new SelectionController().attach();
new ProtectedSelectionRestorer().attach();
