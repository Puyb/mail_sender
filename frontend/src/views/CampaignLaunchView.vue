<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCampaignStore } from '../stores/campaignStore';
import { useDraftStore } from '../stores/draftStore';
import { api } from '../services/api';

const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();
const draftStore = useDraftStore();

const draftUid = computed(() => Number(route.query.draftUid));
const launching = ref(false);
const error = ref<string | null>(null);
const sendRate = ref(10);

onMounted(async () => {
  try {
    const res = await api.getDefaultSendRate();
    sendRate.value = res.emailsPerMinute;
  } catch {
    /* keep the fallback default */
  }
});

async function handleLaunch() {
  error.value = null;
  launching.value = true;
  try {
    const campaignId = await campaignStore.launchCampaign(draftUid.value, sendRate.value);
    campaignStore.clearRecipients();
    router.push({ name: 'campaign-detail', params: { id: campaignId } });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    launching.value = false;
  }
}
</script>

<template>
  <h1>Lancer la campagne</h1>
  <article>
    <p><strong>Sujet :</strong> {{ draftStore.selected?.subject ?? '—' }}</p>
    <p><strong>Destinataires :</strong> {{ campaignStore.recipientsPreview.length }}</p>
    <p v-if="!campaignStore.recipientsPreview.length" style="color: #c62828">
      Aucun destinataire chargé — retournez à l'étape précédente.
    </p>
    <label for="send-rate">Vitesse d'envoi (emails / minute)</label>
    <input id="send-rate" v-model.number="sendRate" type="number" min="1" step="1" />
    <p v-if="error" style="color: #c62828">{{ error }}</p>
    <button
      :disabled="!campaignStore.recipientsPreview.length || launching || sendRate <= 0"
      :aria-busy="launching"
      @click="handleLaunch"
    >
      Lancer l'envoi
    </button>
  </article>
</template>
