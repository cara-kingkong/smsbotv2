import { getServiceClient } from '@lib/db/client';

export interface OnboardingState {
  hasCampaign: boolean;
  hasAgent: boolean;
  hasSmsProvider: boolean;
  hasCalendar: boolean;
  isActivated: boolean;
  currentStep: 1 | 2 | 3 | 4 | 5;
  completedSteps: number;
}

export async function computeOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const db = getServiceClient();

  const [campaignResult, agentResult, smsResult, calendarResult] = await Promise.all([
    db.from('campaigns').select('id').eq('workspace_id', workspaceId).limit(1),
    db
      .from('agents')
      .select('id, campaigns!inner(workspace_id)')
      .eq('campaigns.workspace_id', workspaceId)
      .is('deleted_at', null)
      .limit(1),
    db.from('integrations').select('id').eq('workspace_id', workspaceId).eq('type', 'sms').limit(1),
    db
      .from('integrations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', 'calendar')
      .limit(1),
  ]);

  const hasCampaign = (campaignResult.data?.length ?? 0) > 0;
  const hasAgent = (agentResult.data?.length ?? 0) > 0;
  const hasSmsProviderInDb = (smsResult.data?.length ?? 0) > 0;
  const hasSmsProviderInEnv = !!(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && process.env.TWILIO_PHONE_NUMBER
  );
  const hasSmsProvider = hasSmsProviderInDb || hasSmsProviderInEnv;
  const hasCalendar = (calendarResult.data?.length ?? 0) > 0;

  const booleans = [hasCampaign, hasAgent, hasSmsProvider, hasCalendar];
  const completedSteps = booleans.filter(Boolean).length;
  const isActivated = completedSteps === 4;

  let currentStep: OnboardingState['currentStep'];
  if (!hasCampaign) {
    currentStep = 1;
  } else if (!hasAgent) {
    currentStep = 2;
  } else if (!hasSmsProvider) {
    currentStep = 3;
  } else if (!hasCalendar) {
    currentStep = 4;
  } else {
    currentStep = 5;
  }

  return {
    hasCampaign,
    hasAgent,
    hasSmsProvider,
    hasCalendar,
    isActivated,
    currentStep,
    completedSteps,
  };
}
