<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCampaignStore } from '../stores/campaignStore';
import RecipientTable from '../components/RecipientTable.vue';

const props = defineProps<{ uid: string }>();

const campaignStore = useCampaignStore();
const router = useRouter();
const error = ref<string | null>(null);
const loading = ref(false);

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  error.value = null;
  loading.value = true;
  try {
    await campaignStore.uploadFile(file);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function handleContinue() {
  router.push({ name: 'campaign-new', query: { draftUid: props.uid } });
}
</script>

<template>
  <h1>Destinataires</h1>
  <p>Chargez un fichier CSV (colonnes email, prénom, nom) ou une vCard (.vcf) exportée depuis un carnet de contacts.</p>
  <input type="file" accept=".csv,.vcf" @change="handleFileChange" />
  <p v-if="loading" aria-busy="true">Analyse du fichier…</p>
  <p v-if="error" style="color: #c62828">{{ error }}</p>

  <RecipientTable
    v-if="campaignStore.recipientsPreview.length"
    :recipients="campaignStore.recipientsPreview"
    :warnings="campaignStore.warnings"
  />

  <button v-if="campaignStore.recipientsPreview.length" @click="handleContinue">Continuer</button>
</template>
