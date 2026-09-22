<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDraftStore } from '../stores/draftStore';
import DraftListItem from '../components/DraftListItem.vue';

const draftStore = useDraftStore();
const router = useRouter();
const selecting = ref(false);

onMounted(() => {
  draftStore.loadDrafts();
});

async function handleSelect(uid: number) {
  selecting.value = true;
  try {
    await draftStore.selectDraft(uid);
  } finally {
    selecting.value = false;
  }
}

function handleContinue() {
  if (!draftStore.selected) return;
  router.push({ name: 'recipients', params: { uid: String(draftStore.selected.uid) } });
}
</script>

<template>
  <h1>Choisir un brouillon</h1>
  <p v-if="draftStore.error" style="color: #c62828">{{ draftStore.error }}</p>
  <p v-if="draftStore.loading" aria-busy="true">Chargement des brouillons…</p>

  <div class="grid" v-else style="grid-template-columns: 1fr 2fr; align-items: start">
    <div>
      <p v-if="!draftStore.drafts.length">Aucun brouillon trouvé.</p>
      <ul>
        <li v-for="d in draftStore.drafts" :key="d.uid">
          <DraftListItem :draft="d" :active="draftStore.selected?.uid === d.uid" @select="handleSelect(d.uid)" />
        </li>
      </ul>
    </div>

    <article v-if="draftStore.selected">
      <h3>{{ draftStore.selected.subject }}</h3>
      <p v-if="draftStore.selected.attachmentCount"><em>{{ draftStore.selected.attachmentCount }} pièce(s) jointe(s)</em></p>
      <iframe
        v-if="draftStore.selected.html"
        :srcdoc="draftStore.selected.html"
        sandbox=""
        style="width: 100%; height: 400px; border: 1px solid #ccc"
      ></iframe>
      <pre v-else-if="draftStore.selected.text" style="white-space: pre-wrap">{{ draftStore.selected.text }}</pre>
      <p v-else><em>Brouillon vide</em></p>
      <button @click="handleContinue">Continuer avec ce brouillon</button>
    </article>
    <p v-else-if="selecting" aria-busy="true">Chargement du contenu…</p>
  </div>
</template>
