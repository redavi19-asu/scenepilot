import { createRoot } from "react-dom/client";
import AIStudio from "./AIStudio.jsx";

let observer = null;
let mountedRoot = null;
let host = null;

function placeStudio() {
  const editor = document.querySelector(".replay-studio.nle-studio");
  if (!editor) return false;

  if (host?.isConnected) return true;

  host = document.createElement("div");
  host.id = "urban-director-ai-studio-root";
  editor.insertAdjacentElement("afterend", host);
  mountedRoot = createRoot(host);
  mountedRoot.render(<AIStudio/>);
  return true;
}

export function startAIStudioMount() {
  if (observer) return;

  placeStudio();
  observer = new MutationObserver(() => {
    if (host && !host.isConnected) {
      mountedRoot?.unmount?.();
      mountedRoot = null;
      host = null;
    }
    placeStudio();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
