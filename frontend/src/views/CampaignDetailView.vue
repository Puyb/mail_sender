<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../services/api';
import { useCampaignStore } from '../stores/campaignStore';
import ProgressBar from '../components/ProgressBar.vue';
import CampaignStatusBadge from '../components/CampaignStatusBadge.vue';
import type { CampaignDetail } from '../types';

const props = defineProps<{ id: string }>();
const campaignStore = useCampaignStore();
const detail = ref<CampaignDetail | null>(null);
const error = ref<string | null>(null);

async function load() {
  try {
    detail.value = await api.getCampaign(props.id);
    if (detail.value.campaign.status === 'pending' || detail.value.campaign.status === 'running') {
      campaignStore.subscribeToCampaign(props.id);
    }
  } catch (err) {
    error.value = (err as Error).message;
  }
}

onMounted(load);

watch(
  () => campaignStore.completed,
  (completed) => {
    if (completed && completed.campaignId === props.id) {
      load();
    }
  },
);

const liveProgress = computed(() => {
  if (campaignStore.progress && campaignStore.progress.campaignId === props.id) {
    return campaignStore.progress;
  }
  if (detail.value) {
    return {
      sentCount: detail.value.campaign.sent_count,
      failedCount: detail.value.campaign.failed_count,
      totalRecipients: detail.value.campaign.total_recipients,
    };
  }
  return null;
});
</script>

<template>
  <p v-if="error" style="color: #c62828">{{ error }}</p>
  <template v-if="detail">
    <h1>{{ detail.campaign.subject }}</h1>
    <p>
      <CampaignStatusBadge :status="detail.campaign.status" /> —
      créée le {{ new Date(detail.campaign.created_at).toLocaleString() }}
    </p>

    <ProgressBar
      v-if="liveProgress && (detail.campaign.status === 'pending' || detail.campaign.status === 'running')"
      :sent="liveProgress.sentCount"
      :failed="liveProgress.failedCount"
      :total="liveProgress.totalRecipients"
    />

    <article v-else>
      <h3>Statistiques</h3>
      <ul>
        <li>Destinataires : {{ detail.campaign.total_recipients }}</li>
        <li>Envoyés : {{ detail.campaign.sent_count }}</li>
        <li>Échecs : {{ detail.campaign.failed_count }}</li>
        <li>Ouvertures uniques : {{ detail.tracking.uniqueOpens }} ({{ detail.tracking.totalOpens }} au total)</li>
        <li>Clics uniques : {{ detail.tracking.uniqueClicks }} ({{ detail.tracking.totalClicks }} au total)</li>
      </ul>

      <h3 v-if="detail.links.length">Liens</h3>
      <table v-if="detail.links.length">
        <thead><tr><th>Lien</th><th>Clics</th><th>Cliqueurs uniques</th></tr></thead>
        <tbody>
          <tr v-for="l in detail.links" :key="l.linkId">
            <td style="word-break: break-all">{{ l.originalUrl }}</td>
            <td>{{ l.totalClicks }}</td>
            <td>{{ l.uniqueClicks }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <h3>Destinataires</h3>
    <table>
      <thead>
        <tr><th>Email</th><th>Statut</th><th>Ouvert</th><th>Cliqué</th><th>Erreur</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in detail.recipients" :key="r.id">
          <td>{{ r.email }}</td>
          <td>{{ r.status }}</td>
          <td>{{ r.opened_at ? new Date(r.opened_at).toLocaleString() : '—' }}</td>
          <td>{{ r.clicked_at ? new Date(r.clicked_at).toLocaleString() : '—' }}</td>
          <td>{{ r.error_reason ?? '' }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
