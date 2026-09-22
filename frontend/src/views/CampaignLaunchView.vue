<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCampaignStore } from '../stores/campaignStore';
import { useDraftStore } from '../stores/draftStore';

const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();
const draftStore = useDraftStore();

const draftUid = computed(() => Number(route.query.draftUid));
const launching = ref(false);
const error = ref<string | null>(null);

async function handleLaunch() {
  error.value = null;
  launching.value = true;
  try {
    const campaignId = await campaignStore.launchCampaign(draftUid.value);
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
    <p v-if="error" style="color: #c62828">{{ error }}</p>
    <button :disabled="!campaignStore.recipientsPreview.length || launching" :aria-busy="launching" @click="handleLaunch">
      Lancer l'envoi
    </button>
  </article>
</template>
