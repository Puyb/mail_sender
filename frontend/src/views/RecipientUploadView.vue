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
const isDragging = ref(false);
const dragCounter = ref(0);

const ACCEPTED_EXTENSIONS = ['.csv', '.vcf'];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

async function handleFiles(files: File[]) {
  const accepted = files.filter(isAcceptedFile);
  if (!accepted.length) {
    error.value = 'Fichier non supporté — utilisez un CSV ou une vCard (.vcf).';
    return;
  }
  error.value = null;
  loading.value = true;
  try {
    for (const file of accepted) {
      await campaignStore.uploadFile(file);
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  if (!files.length) return;
  await handleFiles(files);
}

function handleDragEnter(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragCounter.value += 1;
  isDragging.value = true;
}

function handleDragLeave() {
  dragCounter.value = Math.max(0, dragCounter.value - 1);
  if (dragCounter.value === 0) isDragging.value = false;
}

async function handleDrop(event: DragEvent) {
  dragCounter.value = 0;
  isDragging.value = false;
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (!files.length) return;
  await handleFiles(files);
}

function handleRemove(email: string) {
  campaignStore.removeRecipient(email);
}

function handleClearAll() {
  campaignStore.clearRecipients();
}

function handleContinue() {
  router.push({ name: 'campaign-new', query: { draftUid: props.uid } });
}
</script>

<template>
  <h1>Destinataires</h1>
  <p>Chargez un ou plusieurs fichiers CSV (colonnes email, prénom, nom) ou vCard (.vcf) exportés depuis un carnet de contacts. Chaque fichier supplémentaire vient s'ajouter à la liste.</p>

  <div
    class="dropzone"
    :class="{ 'dropzone--active': isDragging }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <p>Glissez-déposez un ou plusieurs fichiers ici, ou :</p>
    <input type="file" accept=".csv,.vcf" multiple @change="handleFileChange" />
  </div>

  <p v-if="loading" aria-busy="true">Analyse du fichier…</p>
  <p v-if="error" style="color: #c62828">{{ error }}</p>

  <RecipientTable
    v-if="campaignStore.recipientsPreview.length"
    :recipients="campaignStore.recipientsPreview"
    :warnings="campaignStore.warnings"
    @remove="handleRemove"
  />

  <div v-if="campaignStore.recipientsPreview.length" style="display: flex; gap: 0.75rem; align-items: center">
    <button @click="handleContinue">Continuer</button>
    <a href="#" role="button" class="outline contrast" @click.prevent="handleClearAll">Supprimer tous les contacts</a>
  </div>
</template>

<style scoped>
.dropzone {
  border: 2px dashed var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius);
  padding: 1.5rem;
  text-align: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.dropzone--active {
  border-color: var(--pico-primary);
  background-color: var(--pico-primary-focus);
}
</style>
