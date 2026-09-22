<script setup lang="ts">
import { onMounted } from 'vue';
import { useCampaignStore } from '../stores/campaignStore';
import CampaignStatusBadge from '../components/CampaignStatusBadge.vue';

const campaignStore = useCampaignStore();

onMounted(() => {
  campaignStore.loadHistory();
});
</script>

<template>
  <h1>Historique des campagnes</h1>
  <p v-if="!campaignStore.campaigns.length">Aucune campagne pour le moment.</p>
  <table v-else>
    <thead>
      <tr>
        <th>Sujet</th>
        <th>Statut</th>
        <th>Envoyés / Total</th>
        <th>Échecs</th>
        <th>Ouvertures</th>
        <th>Clics</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in campaignStore.campaigns" :key="c.id">
        <td><RouterLink :to="{ name: 'campaign-detail', params: { id: c.id } }">{{ c.subject }}</RouterLink></td>
        <td><CampaignStatusBadge :status="c.status" /></td>
        <td>{{ c.sent_count }} / {{ c.total_recipients }}</td>
        <td>{{ c.failed_count }}</td>
        <td>{{ c.tracking.uniqueOpens }}</td>
        <td>{{ c.tracking.uniqueClicks }}</td>
        <td>{{ new Date(c.created_at).toLocaleString() }}</td>
      </tr>
    </tbody>
  </table>
</template>
