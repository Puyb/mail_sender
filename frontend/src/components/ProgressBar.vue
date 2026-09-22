<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  sent: number;
  failed: number;
  total: number;
}>();

const done = computed(() => props.sent + props.failed);
const percent = computed(() => (props.total > 0 ? Math.round((done.value / props.total) * 100) : 0));
</script>

<template>
  <div>
    <progress :value="done" :max="total"></progress>
    <p>
      {{ percent }}% — {{ done }} / {{ total }} traités
      (<strong>{{ sent }}</strong> envoyés, <strong>{{ failed }}</strong> échecs)
    </p>
  </div>
</template>
