<script setup lang="ts">
import type { DraftSummary } from '../types';

defineProps<{
  draft: DraftSummary;
  active: boolean;
}>();
defineEmits<{ select: [] }>();
</script>

<template>
  <a href="#" :aria-current="active" @click.prevent="$emit('select')">
    <strong>{{ draft.subject }}</strong>
    <br />
    <small>{{ draft.date ? new Date(draft.date).toLocaleString() : '' }}</small>
  </a>
</template>
