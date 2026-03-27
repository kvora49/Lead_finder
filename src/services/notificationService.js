import { getFunctions, httpsCallable } from 'firebase/functions';

export const triggerSystemEmail = async (type, payload = {}) => {
  try {
    const fns = getFunctions();
    const callable = httpsCallable(fns, 'sendSystemEmail');
    const res = await callable({ type, payload });
    return res?.data || null;
  } catch (error) {
    console.warn('[notificationService] sendSystemEmail failed:', error?.message || error);
    return null;
  }
};

export default {
  triggerSystemEmail,
};
