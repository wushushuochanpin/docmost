import { DocumentCommandError } from './document-candidate';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function imageAttachmentId(attrs: Record<string, any>): string {
  const id = attrs.attachmentId;
  if (
    typeof id !== 'string' ||
    !uuid.test(id) ||
    attrs.src !== `/files/by-id/${id}`
  )
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  return id;
}
export function imageReferences(content: any): string[] {
  const ids: string[] = [];
  const visit = (node: any) => {
    if (node?.type === 'image') ids.push(imageAttachmentId(node.attrs ?? {}));
    node?.content?.forEach(visit);
  };
  visit(content);
  return [...new Set(ids)];
}
