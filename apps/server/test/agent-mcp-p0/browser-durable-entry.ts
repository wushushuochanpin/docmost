import { DurableProvider } from '../../../client/src/features/editor/durable/durable-provider';
import { readDurableDraft } from '../../../client/src/features/editor/durable/recovery-store';
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
const state: any = {};
(window as any).fixture = state;
state.connect = (config: any) => {
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url: config.url });
  const provider = new DurableProvider({
    name: 'page.' + config.pageId,
    document: doc,
    websocketProvider: socket,
    token: 'isolated-fixture',
    onSynced: ({ state: ready }) => {
      state.synced = ready;
      if (ready && !state.editor) state.mount();
    },
  });
  provider.scope = config.scope;
  provider.onDurableState = (value) => {
    state.status = value;
    state.editor?.setEditable(value.permitted && !value.recovery);
    document.getElementById('status')!.textContent = JSON.stringify(value);
  };
  state.doc = doc;
  state.provider = provider;
  state.socket = socket;
  state.mount = () => {
    state.editor = new Editor({
      element: document.getElementById('editor')!,
      editable: false,
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc }),
      ],
    });
    state.editor.setEditable(state.status?.permitted === true);
  };
  provider.attach();
  state.draft = () => readDurableDraft(config.scope);
  state.append = (value: string) => {
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.insert(0, value);
    paragraph.insert(0, [text]);
    doc.getXmlFragment('default').push([paragraph]);
  };
};
