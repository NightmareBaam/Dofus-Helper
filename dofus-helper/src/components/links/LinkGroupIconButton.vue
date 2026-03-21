<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  action: string;
  label: string;
  iconKey?: string;
  disabled?: boolean;
  danger?: boolean;
}>(), {
  iconKey: undefined,
  disabled: false,
  danger: false,
});

const emit = defineEmits<{
  click: [];
}>();

  const iconMarkup = computed(() => {
  const icons: Record<string, string> = {
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path><path d="M10 10v6"></path><path d="M14 10v6"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    "eye-off": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.3A11.4 11.4 0 0 1 12 6c6.5 0 10 6 10 6a18.7 18.7 0 0 1-4 4.6"></path><path d="M6.7 6.8C3.8 8.7 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.4 4.6-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>',
  };
  return icons[props.iconKey ?? props.action] ?? "";
});
</script>

<template>
  <button
    class="icon-btn link-action-btn"
    :class="{ 'danger-btn': danger }"
    :disabled="disabled"
    type="button"
    :data-action="action"
    :title="label"
    :aria-label="label"
    @click="emit('click')"
  >
    <span aria-hidden="true" v-html="iconMarkup" />
  </button>
</template>

<style scoped>
.link-action-btn {
  width: 30px;
  height: 30px;
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.link-action-btn:hover {
  background: rgba(140, 188, 69, 0.28);
}

.link-action-btn.danger-btn {
  background: rgba(223, 46, 46, 0.49);
  color: var(--danger);
}

.link-action-btn.danger-btn:hover {
  background: rgba(236, 16, 16, 0.915);
}
</style>
