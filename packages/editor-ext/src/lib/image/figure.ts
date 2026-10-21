import { Node, mergeAttributes } from '@tiptap/core';

/** Keeps an image and its editable caption together through HTML, Yjs and history. */
export const ImageFigure = Node.create({
  name: 'imageFigure',
  group: 'block',
  content: 'image imageCaption?',
  defining: true,
  isolating: true,
  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (element) => (element.querySelector('img') ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        class: 'image-figure',
        style: 'margin: 1em 0',
      }),
      0,
    ];
  },
});

export const ImageCaption = Node.create({
  name: 'imageCaption',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'figcaption' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figcaption',
      mergeAttributes(HTMLAttributes, {
        style:
          'text-align: center; font-size: 0.875em; opacity: 0.8; position: relative; z-index: 3',
      }),
      0,
    ];
  },
});
