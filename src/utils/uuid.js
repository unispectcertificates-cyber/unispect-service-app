/**
 * uuid.js
 * Gerador universal de identificadores únicos compatível com todos os navegadores,
 * WebViews Android (Chrome, Samsung Internet, Android System WebView, Opera, etc.)
 * e ambientes Node.js de teste.
 * Não depende de recursos exclusivos de nenhum fabricante ou versão específica de WebView.
 */

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 para WebViews Android antigas ou navegadores sem crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
