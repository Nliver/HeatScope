export function neutralizePreviewHtml(html: string) {
  if (typeof document === 'undefined' || !html) return html;
  const documentFragment = new DOMParser().parseFromString(html, 'text/html');
  documentFragment.querySelectorAll('script').forEach((node) => node.remove());
  documentFragment.querySelectorAll('a').forEach((node) => {
    node.removeAttribute('href');
    node.removeAttribute('target');
    node.removeAttribute('rel');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-disabled', 'true');
  });
  documentFragment.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((node) => {
    node.setAttribute('type', 'button');
    node.removeAttribute('formaction');
  });
  documentFragment.querySelectorAll('form').forEach((node) => {
    node.removeAttribute('action');
    node.removeAttribute('method');
  });
  documentFragment.querySelectorAll<HTMLElement>('*').forEach((node) => {
    Array.from(node.attributes).filter((attribute) => /^on/i.test(attribute.name)).forEach((attribute) => node.removeAttribute(attribute.name));
  });
  return `<!doctype html>${documentFragment.documentElement.outerHTML}`;
}
