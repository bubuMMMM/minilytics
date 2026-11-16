/** Human-readable labels for heatmap selectors (last tag + visible text or id). */
const TAG_ROLE: Record<string, string> = {
  a: 'Lien',
  button: 'Bouton',
  input: 'Champ',
  textarea: 'Champ',
  select: 'Liste',
  option: 'Option',
  summary: 'Accordéon',
  details: 'Accordéon',
  label: 'Libellé',
  nav: 'Navigation',
  header: 'En-tête',
  footer: 'Pied de page',
  h1: 'Titre',
  h2: 'Titre',
  h3: 'Titre',
  h4: 'Titre',
  h5: 'Titre',
  h6: 'Titre',
  img: 'Image',
  svg: 'Icône',
  picture: 'Image',
  video: 'Vidéo',
  li: 'Liste',
  ul: 'Liste',
  ol: 'Liste',
  p: 'Texte',
  span: 'Texte',
  em: 'Texte',
  strong: 'Texte',
  div: 'Bloc',
  section: 'Section',
  article: 'Article',
  main: 'Contenu',
  form: 'Formulaire',
  dialog: 'Dialogue',
  td: 'Cellule',
  th: 'Cellule',
};

export function shortSelector(selector: string): string {
  const parts = selector.split('>').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join('>') || selector;
  return parts.slice(-2).join('>');
}

export function heatElementLabel(selector: string, text?: string | null): string {
  const parts = selector.split('>').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || selector;
  const tag = (last.match(/^([A-Za-z][\w-]*)/)?.[1] || '').toLowerCase();
  const role = TAG_ROLE[tag] || 'Élément';
  const visible = (text ?? '').replace(/\s+/g, ' ').trim();
  if (visible) return `${role} · ${visible}`;
  const id = last.match(/#([A-Za-z][\w-]{0,40})/)?.[1];
  if (id) return `${role} · #${id}`;
  return role;
}
