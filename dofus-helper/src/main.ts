import { createApp } from "vue";
import App from "./App.vue";
import { ensureBackendReady } from "./services/sidecar";
import './styles.css';

void ensureBackendReady()
  .catch((error) => {
    console.error("[bootstrap]", error);
  })
  .finally(() => {
    createApp(App).mount("#app");
  });
