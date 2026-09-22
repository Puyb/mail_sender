<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../services/api';
import { useCampaignStore } from '../stores/campaignStore';
import ProgressBar from '../components/ProgressBar.vue';
import CampaignStatusBadge from '../components/CampaignStatusBadge.vue';
import { formatRate } from '../utils/format';
import type { CampaignDetail } from '../types';

const props = defineProps<{ id: string }>();
const campaignStore = useCampaignStore();
const detail = ref<CampaignDetail | null>(null);
const error = ref<string | null>(null);
const sendRateInput = ref(0);
const applyingRate = ref(false);
const rateError = ref<string | null>(null);
const stopping = ref(false);
const stopError = ref<string | null>(null);

async function load() {
  try {
    detail.value = await api.getCampaign(props.id);
    sendRateInput.value = detail.value.campaign.send_rate_per_min;
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

watch(
  () => campaignStore.rateChanged,
  (rateChanged) => {
    if (rateChanged && rateChanged.campaignId === props.id) {
      sendRateInput.value = rateChanged.emailsPerMinute;
    }
  },
);

// Tracking stats (opens/clicks) aren't pushed over the socket, so refresh them periodically
// while the campaign is sending — throttled so it doesn't fire on every single progress tick.
let lastTrackingRefresh = 0;
watch(
  () => campaignStore.progress,
  async (progress) => {
    if (!progress || progress.campaignId !== props.id) return;
    const now = Date.now();
    if (now - lastTrackingRefresh < 4000) return;
    lastTrackingRefresh = now;
    try {
      detail.value = await api.getCampaign(props.id);
    } catch {
      /* keep last known stats on a transient refresh failure */
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

const isActive = computed(
  () => detail.value?.campaign.status === 'pending' || detail.value?.campaign.status === 'running',
);

async function applySendRate() {
  rateError.value = null;
  applyingRate.value = true;
  try {
    await campaignStore.updateSendRate(props.id, sendRateInput.value);
  } catch (err) {
    rateError.value = (err as Error).message;
  } finally {
    applyingRate.value = false;
  }
}

async function stopCampaign() {
  if (!confirm("Arrêter cette campagne ? Les destinataires restants ne recevront pas l'email.")) return;
  stopError.value = null;
  stopping.value = true;
  try {
    await campaignStore.stopCampaign(props.id);
  } catch (err) {
    stopError.value = (err as Error).message;
  } finally {
    stopping.value = false;
  }
}
</script>

<template>
  <p v-if="error" style="color: #c62828">{{ error }}</p>
  <template v-if="detail">
    <h1>{{ detail.campaign.subject }}</h1>
    <p>
      <CampaignStatusBadge :status="detail.campaign.status" /> —
      créée le {{ new Date(detail.campaign.created_at).toLocaleString() }}
    </p>

    <template v-if="liveProgress && isActive">
      <ProgressBar :sent="liveProgress.sentCount" :failed="liveProgress.failedCount" :total="liveProgress.totalRecipients" />

      <article>
        <label for="send-rate-live">Vitesse d'envoi (emails / minute)</label>
        <input id="send-rate-live" v-model.number="sendRateInput" type="number" min="1" step="1" :disabled="applyingRate" />
        <button :disabled="applyingRate || sendRateInput <= 0" :aria-busy="applyingRate" @click="applySendRate">
          Appliquer
        </button>
        <p v-if="rateError" style="color: #c62828">{{ rateError }}</p>
      </article>

      <article>
        <button :disabled="stopping" :aria-busy="stopping" style="color: #c62828" @click="stopCampaign">
          Arrêter la campagne
        </button>
        <p v-if="stopError" style="color: #c62828">{{ stopError }}</p>
      </article>
    </template>

    <article>
      <h3>Statistiques</h3>
      <ul>
        <li>Destinataires : {{ detail.campaign.total_recipients }}</li>
        <li>Envoyés : {{ detail.campaign.sent_count }}</li>
        <li>Échecs : {{ detail.campaign.failed_count }}</li>
        <li>% Ouverts : {{ formatRate(detail.tracking.uniqueOpens, liveProgress?.sentCount ?? detail.campaign.sent_count) }} ({{ detail.tracking.totalOpens }} ouverture(s) au total)</li>
        <li>% Cliqués : {{ formatRate(detail.tracking.uniqueClicks, liveProgress?.sentCount ?? detail.campaign.sent_count) }} ({{ detail.tracking.totalClicks }} clic(s) au total)</li>
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
