<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useAuthStore } from './stores/authStore';

const authStore = useAuthStore();
const router = useRouter();

async function handleLogout() {
  await authStore.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <main class="container">
    <nav v-if="authStore.isAuthenticated">
      <ul>
        <li><strong>Mail Sender</strong></li>
      </ul>
      <ul>
        <li><RouterLink to="/drafts">Nouvelle campagne</RouterLink></li>
        <li><RouterLink to="/campaigns">Historique</RouterLink></li>
      </ul>
      <ul>
        <li>{{ authStore.email }}</li>
        <li><a href="#" @click.prevent="handleLogout">Déconnexion</a></li>
      </ul>
    </nav>
    <RouterView />
  </main>
</template>
