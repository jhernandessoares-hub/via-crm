import { PrismaService } from '../prisma/prisma.service';

/**
 * Preferências de notificação do usuário (User.notificationSettings).
 * Fonte única consultada antes de cada disparo ao corretor.
 */
export interface NotifPrefs {
  events: string[];
  stages: string[];
  allTenantQualified: boolean;
}

// Padrão para quem nunca configurou: recebe novo lead E lead qualificado.
export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  events: ['new_lead', 'lead_qualified'],
  stages: [],
  allTenantQualified: false,
};

export async function getUserNotifPrefs(prisma: PrismaService, userId: string): Promise<NotifPrefs> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  });
  const s = user?.notificationSettings as any;
  if (!s) return { ...DEFAULT_NOTIF_PREFS };
  return {
    events: Array.isArray(s.events) ? s.events : DEFAULT_NOTIF_PREFS.events,
    stages: Array.isArray(s.stages) ? s.stages : [],
    allTenantQualified: !!s.allTenantQualified,
  };
}

/** O usuário quer receber este tipo de evento? (ex: 'new_lead', 'lead_qualified') */
export async function userWantsEvent(prisma: PrismaService, userId: string, eventKey: string): Promise<boolean> {
  const p = await getUserNotifPrefs(prisma, userId);
  return p.events.includes(eventKey);
}

/** O usuário quer notificação ao avançar para esta etapa? (exige 'stage_change' + etapa selecionada) */
export async function userWantsStageNotification(prisma: PrismaService, userId: string, stageKey: string): Promise<boolean> {
  const p = await getUserNotifPrefs(prisma, userId);
  return p.events.includes('stage_change') && p.stages.includes(stageKey);
}
