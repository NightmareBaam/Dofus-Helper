<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  submitLabel?: string;
  initialLabel?: string;
  initialUrl?: string;
}>(), {
  subtitle: "",
  submitLabel: "Valider",
  initialLabel: "",
  initialUrl: "https://",
});

const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", label: string, url: string): void;
}>();

const linkLabel = ref(props.initialLabel);
const linkUrl = ref(props.initialUrl);

watch(
  [() => props.open, () => props.initialLabel, () => props.initialUrl],
  ([open, initialLabel, initialUrl]: [boolean, string, string]) => {
    if (!open) {
      return;
    }
    linkLabel.value = initialLabel;
    linkUrl.value = initialUrl;
  },
);

function closeModal(): void {
  emit("close");
}

function submitModal(): void {
  const label = linkLabel.value.trim();
  const url = linkUrl.value.trim();
  if (!label || !url) {
    return;
  }
  emit("submit", label, url);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center bg-[#081117]/70 px-4 backdrop-blur-sm"
    @click.self="closeModal"
  >
    <div class="w-full max-w-xl rounded-[22px] border border-white/8 bg-[#182833] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-semibold text-[#f5f0e3]">{{ title }}</h3>
          <p v-if="subtitle" class="mt-1 text-sm text-[#9aa8a2]">{{ subtitle }}</p>
        </div>
        <button
          type="button"
          class="rounded-[12px] border border-white/8 bg-[#213742] px-3 py-2 text-sm text-stone-200"
          @click="closeModal"
        >
          Fermer
        </button>
      </div>

      <form class="mt-5" @submit.prevent="submitModal">
        <div class="space-y-3">
          <input
            v-model="linkLabel"
            class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
            placeholder="Nom du lien"
          >
          <input
            v-model="linkUrl"
            class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
            placeholder="https://"
          >
        </div>

        <footer class="mt-5 flex justify-end">
          <button class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311]" type="submit">{{ submitLabel }}</button>
        </footer>
      </form>
    </div>
  </div>
</template>
