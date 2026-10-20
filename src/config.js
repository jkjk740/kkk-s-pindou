function normalizeBase(value, production, experienceIp = false) {
  const match = /^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?\/*$/i.exec(String(value || '').trim());
  if (!match) return '';
  const protocol = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const port = match[3] ? Number(match[3]) : null;
  if (port !== null && (port < 1 || port > 65535)) return '';
  const allowedExperienceIp = experienceIp && protocol === 'http' && host === '121.41.36.64' && (port === null || port === 80);
  if (production && !allowedExperienceIp && (protocol !== 'https' || host === 'localhost' || host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host))) return '';
  const defaultPort = protocol === 'https' ? 443 : 80;
  return protocol + '://' + host + (port && port !== defaultPort ? ':' + port : '');
}
const production = import.meta.env.PROD;
const experienceIp = import.meta.env.MODE === 'experience-ip';
export default {
  dcloudAppId: '__UNI__ACD00BD',
  wechatAppId: 'wx0ebba69092706cc6',
  apiBaseUrl: normalizeBase(import.meta.env.VITE_API_BASE_URL || (production ? '' : 'http://127.0.0.1:3001'), production, experienceIp),
  cloudEnabled: false
};
