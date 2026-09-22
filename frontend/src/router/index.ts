import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import LoginView from '../views/LoginView.vue';
import DraftSelectionView from '../views/DraftSelectionView.vue';
import RecipientUploadView from '../views/RecipientUploadView.vue';
import CampaignLaunchView from '../views/CampaignLaunchView.vue';
import CampaignHistoryView from '../views/CampaignHistoryView.vue';
import CampaignDetailView from '../views/CampaignDetailView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/drafts', name: 'drafts', component: DraftSelectionView },
    { path: '/drafts/:uid/recipients', name: 'recipients', component: RecipientUploadView, props: true },
    { path: '/campaigns/new', name: 'campaign-new', component: CampaignLaunchView },
    { path: '/campaigns', name: 'campaigns', component: CampaignHistoryView },
    { path: '/campaigns/:id', name: 'campaign-detail', component: CampaignDetailView, props: true },
    { path: '/', redirect: '/drafts' },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  if (authStore.loading) {
    await authStore.fetchMe();
  }
  if (!to.meta.public && !authStore.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'drafts' };
  }
  return true;
});

export default router;
