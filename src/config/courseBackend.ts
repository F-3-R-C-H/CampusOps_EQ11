import { Platform } from 'react-native';

const LOCAL_PORT = 4310;

export function getCourseBackendBaseUrl(platform = Platform.OS): string {
  const configured = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return platform === 'android'
    ? `http://10.0.2.2:${LOCAL_PORT}`
    : `http://127.0.0.1:${LOCAL_PORT}`;
}

export function getCourseActor(): string {
  return process.env.EXPO_PUBLIC_COURSE_ACTOR?.trim() || 'reporter-1';
}

export function getCourseScenario(): string | undefined {
  return process.env.EXPO_PUBLIC_COURSE_SCENARIO?.trim() || undefined;
}
