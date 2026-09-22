<script setup lang="ts">
import { computed } from 'vue';
import type { CampaignStatus } from '../types';

const props = defineProps<{ status: CampaignStatus }>();

const label: Record<CampaignStatus, string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminée',
  failed: 'Échec',
  cancelled: 'Annulée',
};

const color = computed(() => {
  switch (props.status) {
    case 'completed':
      return '#2e7d32';
    case 'running':
      return '#1565c0';
    case 'failed':
      return '#c62828';
    default:
      return '#757575';
  }
});
</script>

<template>
  <span :style="{ color, fontWeight: 'bold' }">{{ label[status] }}</span>
</template>
