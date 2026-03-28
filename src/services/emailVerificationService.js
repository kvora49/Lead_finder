import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

export const sendEmailOtp = async () => {
  const callable = httpsCallable(functions, 'sendEmailOtp');
  const res = await callable({});
  return res?.data || null;
};

export const verifyEmailOtp = async (code) => {
  const callable = httpsCallable(functions, 'verifyEmailOtp');
  const res = await callable({ code });
  return res?.data || null;
};
