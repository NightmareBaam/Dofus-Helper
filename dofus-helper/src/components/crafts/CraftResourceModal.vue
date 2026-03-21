<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(defineProps<{
  open: boolean;
  title?: string;
  submitLabel?: string;
}>(), {
  title: "Ajouter une ressource",
  submitLabel: "Ajouter",
});

const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", payload: { name: string; unitPrice: number; quantity: number; ownedQuantity: number; included: boolean }): void;
}>();

const resourceName = ref("");
const resourceUnitPrice = ref("0");
const resourceQuantity = ref("1");
const resourceOwnedQuantity = ref("0");
const resourceIncluded = ref(true);

watch(() => props.open, (open) => {
  if (!open) {
    return;
  }
  resourceName.value = "";
  resourceUnitPrice.value = "0";
  resourceQuantity.value = "1";
  resourceOwnedQuantity.value = "0";
  resourceIncluded.value = true;
});

function closeModal(): void {
  emit("close");
}

function submitModal(): void {
  const unitPrice = Number.parseFloat(resourceUnitPrice.value.replace(",", "."));
  const quantity = Number.parseInt(resourceQuantity.value, 10);
  const ownedQuantity = Number.parseInt(resourceOwnedQuantity.value, 10);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(ownedQuantity) || ownedQuantity < 0) {
    return;
  }

  emit("submit", {
    name: resourceName.value.trim(),
    unitPrice,
    quantity,
    ownedQuantity,
    included: resourceIncluded.value,
  });
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
        <h3 class="text-xl font-semibold text-[#f5f0e3]">{{ title }}</h3>
        <button
          type="button"
          class="rounded-[12px] border border-white/8 bg-[#213742] px-3 py-2 text-sm text-stone-200"
          @click="closeModal"
        >
          Fermer
        </button>
      </div>

      <form class="mt-5" @submit.prevent="submitModal">
        <div class="grid gap-3">
          <label class="grid gap-2">
            <span class="text-sm text-stone-300/80">Nom de la ressource</span>
            <input
              v-model="resourceName"
              class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
              placeholder="Nom de la ressource"
            >
          </label>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="grid gap-2">
              <span class="text-sm text-stone-300/80">Prix / u</span>
              <input
                v-model="resourceUnitPrice"
                class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none focus:border-[#a7d246]/45"
                type="number"
                min="0"
                step="0.01"
                placeholder="Prix / u"
              >
            </label>
            <label class="grid gap-2">
              <span class="text-sm text-stone-300/80">Qt / craft</span>
              <input
                v-model="resourceQuantity"
                class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none focus:border-[#a7d246]/45"
                type="number"
                min="1"
                step="1"
                placeholder="Qt / craft"
              >
            </label>
            <label class="grid gap-2">
              <span class="text-sm text-stone-300/80">Stock</span>
              <input
                v-model="resourceOwnedQuantity"
                class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none focus:border-[#a7d246]/45"
                type="number"
                min="0"
                step="1"
                placeholder="Stock"
              >
            </label>
          </div>
          <label class="inline-flex items-center gap-3 text-sm text-stone-200/80">
            <input v-model="resourceIncluded" type="checkbox">
            <span>Inclure dans le calcul du cout</span>
          </label>
        </div>

        <footer class="mt-5 flex justify-end">
          <button class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311]" type="submit">{{ submitLabel }}</button>
        </footer>
      </form>
    </div>
  </div>
</template>
