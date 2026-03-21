<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { buildBackendUrl, type RetroFamiliarItem } from "../../services/backendClient";

const props = defineProps<{
  item: RetroFamiliarItem;
}>();

function formatFoodLabel(food: RetroFamiliarItem["effects"][number]["foods"][number]): string {
  if (food.type === "monster" && food.effect.toLowerCase().includes("vaincre")) {
    const quantityMatch = food.effect.match(/vaincre\s+(\d+)x/i);
    const quantity = quantityMatch ? Number.parseInt(quantityMatch[1], 10) : 1;
    return `${quantity}x ${food.name}`;
  }
  return food.name;
}

function imageUrl(): string {
  return props.item.imageName ? buildBackendUrl(`/api/familiars/retro/images/${encodeURIComponent(props.item.imageName)}`) : "";
}

async function openExternalLink(url: string | null): Promise<void> {
  if (!url) {
    return;
  }
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div>
    <div class="flex items-start gap-4">
      <img
        v-if="item.imageName"
        :src="imageUrl()"
        :alt="item.name"
        class="h-[78px] w-[78px] shrink-0 rounded-[16px] border border-white/8 bg-[#101a20] object-contain p-2.5"
      >
      <div class="min-w-0">
        <h3 class="text-[24px] font-semibold leading-none text-[#f5f0e3]">{{ item.name }}</h3>
        <button
          v-if="item.url"
          type="button"
          class="mt-2.5 block text-left text-[14px] text-[#f5f0e3] underline underline-offset-4 cursor-pointer hover:text-[#dff2a5]"
          @click="openExternalLink(item.url)"
        >
          Voir sur Solomonk
        </button>
        <div
          v-if="item.feedable && item.mealInterval"
          class="mt-3 inline-flex rounded-full border border-[#4d6840] bg-[#223320] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dff2a5]"
        >
          Nourrissable {{ item.mealInterval.start }}{{ item.mealInterval.unit }} - {{ item.mealInterval.end }}{{ item.mealInterval.unit }}
        </div>
      </div>
    </div>

    <section class="mt-6">
      <div class="text-[15px] font-semibold text-[#f5f0e3]">Effets</div>
      <div class="mt-4 grid gap-3">
        <article
          v-for="(effect, index) in item.effects"
          :key="`${item.key}-${index}`"
          class="overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(135deg,rgba(25,41,51,0.98),rgba(20,33,42,0.98))] shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
        >
          <div class="h-1 bg-[linear-gradient(90deg,#8cbc45,rgba(140,188,69,0.08))]"></div>
          <div class="p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[16px] font-semibold text-[#f5f0e3]">{{ effect.label || "Effet" }}</div>
              </div>
              <div
                v-if="effect.boostedMax !== null"
                class="rounded-full border border-[#4d6840] bg-[#223320] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dff2a5]"
              >
                Capacites accrues {{ effect.boostedMax }}
              </div>
            </div>

            <div v-if="effect.foods.length" class="mt-4 flex flex-wrap gap-2.5">
              <button
                v-for="food in effect.foods"
                :key="`${item.key}-${index}-${food.name}`"
                type="button"
                class="rounded-[12px] border border-white/10 bg-[#223643] px-3.5 py-2 text-[13px] font-medium text-[#f5f0e3] transition cursor-pointer hover:-translate-y-[1px] hover:border-[#7aa752] hover:bg-[#29414f] hover:text-[#dff2a5]"
                @click="openExternalLink(food.url)"
              >
                {{ formatFoodLabel(food) }}
              </button>
            </div>
            <div v-else class="mt-4 text-[13px] text-[#9fb0a8]">
              Aucune ressource associee.
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
