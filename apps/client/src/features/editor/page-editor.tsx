import "@/features/editor/styles/index.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  HocuspocusProvider,
  onStatusParameters,
  WebSocketStatus,
  HocuspocusProviderWebsocket,
  onSyncedParameters,
} from "@hocuspocus/provider";
import {
  Editor,
  EditorContent,
  EditorProvider,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import {
  collabExtensions,
  mainExtensions,
} from "@/features/editor/extensions/extensions";
import { useAtom, useStore } from "jotai";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import {
  pageEditorAtom,
  pageEditorRuntimeModeAtom,
  readOnlyEditorAtom,
  yjsConnectionStatusAtom,
} from "@/features/editor/atoms/editor-atoms";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import {
  activeCommentIdAtom,
  showCommentPopupAtom,
} from "@/features/comment/atoms/comment-atom";
import CommentDialog from "@/features/comment/components/comment-dialog";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import TableCellMenu from "@/features/editor/components/table/table-cell-menu.tsx";
import TableMenu from "@/features/editor/components/table/table-menu.tsx";
import ImageMenu from "@/features/editor/components/image/image-menu.tsx";
import CalloutMenu from "@/features/editor/components/callout/callout-menu.tsx";
import VideoMenu from "@/features/editor/components/video/video-menu.tsx";
import SubpagesMenu from "@/features/editor/components/subpages/subpages-menu.tsx";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler.tsx";
import LinkMenu from "@/features/editor/components/link/link-menu.tsx";
import ExcalidrawMenu from "./components/excalidraw/excalidraw-menu";
import DrawioMenu from "./components/drawio/drawio-menu";
import { useCollabToken } from "@/features/auth/queries/auth-query.tsx";
import SearchAndReplaceDialog from "@/features/editor/components/search-and-replace/search-and-replace-dialog.tsx";
import { useDebouncedCallback, useDocumentVisibility } from "@mantine/hooks";
import { useIdle } from "@/hooks/use-idle.ts";
import { queryClient } from "@/query-client.ts";
import { IPage } from "@/features/page/types/page.types.ts";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { FIVE_MINUTES } from "@/lib/constants.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { jwtDecode } from "jwt-decode";
import { searchSpotlight } from "@/features/search/constants.ts";
import { useEditorScroll } from "./hooks/use-editor-scroll";
import { EditorAiMenu } from "@/ee/ai/components/editor/ai-menu/ai-menu";
import { pageEditModePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import ColumnsMenu from "@/features/editor/components/columns/columns-menu.tsx";
import { normalizeProsemirrorContent } from "@/features/editor/utils/prosemirror-content.ts";
import { notifications } from "@mantine/notifications";
import { updatePage } from "@/features/page/services/page-service";
import { updatePageData } from "@/features/page/queries/page-query";
import { markEditorBootstrapStage } from "@/features/editor/lib/editor-bootstrap-metrics";

type RuntimeMode = "preview" | "local" | "collab";

type SerializedContent = {
  content: any;
  serialized: string;
};

interface PageEditorProps {
  pageId: string;
  editable: boolean;
  content: any;
}

function serializeEditorContent(content: any) {
  try {
    return JSON.stringify(content ?? null);
  } catch {
    return "";
  }
}

function normalizePageEditMode(mode?: string | null): PageEditMode | undefined {
  return mode === PageEditMode.Edit || mode === PageEditMode.Read
    ? mode
    : undefined;
}

function updateCachedPageContent(
  pageId: string,
  slugId: string | undefined,
  newContent: any,
) {
  const updater = (page: IPage | undefined) => {
    if (!page) return page;
    return { ...page, content: newContent };
  };

  queryClient.setQueriesData({ queryKey: ["pages", pageId] }, updater);

  if (slugId && slugId !== pageId) {
    queryClient.setQueriesData({ queryKey: ["pages", slugId] }, updater);
  }
}

function createEditorProps(
  editorRef: React.MutableRefObject<Editor | null>,
  pageId: string,
  currentUserId?: string,
) {
  return {
    scrollThreshold: 90,
    scrollMargin: 90,
    handleDOMEvents: {
      keydown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
          event.preventDefault();
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.code === "KeyK") {
          searchSpotlight.open();
          return true;
        }
        if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
          const slashCommand = document.querySelector("#slash-command");
          if (slashCommand) {
            return true;
          }
        }
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
            event.key,
          )
        ) {
          const emojiCommand = document.querySelector("#emoji-command");
          if (emojiCommand) {
            return true;
          }
        }
      },
    },
    handlePaste: (_view, event) => {
      if (!editorRef.current) return false;

      return handlePaste(editorRef.current, event, pageId, currentUserId);
    },
    handleDrop: (_view, event, _slice, moved) => {
      if (!editorRef.current) return false;

      return handleFileDrop(editorRef.current, event, moved, pageId);
    },
  };
}

function EditorRuntimeView({
  editor,
  editable,
  pageId,
  showCommentPopup,
}: {
  editor: Editor;
  editable: boolean;
  pageId: string;
  showCommentPopup: boolean;
}) {
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const store = useStore();
  const editorIsEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEditable ?? false,
  });

  useEffect(() => {
    if (editor.isDestroyed) {
      return;
    }

    store.set(readOnlyEditorAtom as any, null);
    store.set(pageEditorAtom as any, editor);

    return () => {
      if (store.get(pageEditorAtom as any) === editor) {
        store.set(pageEditorAtom as any, null);
      }
    };
  }, [editor, store]);

  return (
    <div
      className="editor-container"
      style={{ position: "relative" }}
      ref={menuContainerRef}
    >
      <EditorContent editor={editor} />

      <SearchAndReplaceDialog editor={editor} editable={editable} />

      {editorIsEditable && (
        <div>
          <EditorAiMenu editor={editor} />
          <EditorBubbleMenu editor={editor} />
          <TableMenu editor={editor} />
          <TableCellMenu editor={editor} appendTo={menuContainerRef} />
          <ImageMenu editor={editor} />
          <VideoMenu editor={editor} />
          <CalloutMenu editor={editor} />
          <SubpagesMenu editor={editor} />
          <ExcalidrawMenu editor={editor} />
          <DrawioMenu editor={editor} />
          <ColumnsMenu editor={editor} />
          <LinkMenu editor={editor} appendTo={menuContainerRef} />
        </div>
      )}

      {showCommentPopup && <CommentDialog editor={editor} pageId={pageId} />}

      <div
        onClick={() => editor.commands.focus("end")}
        style={{ paddingBottom: "20vh" }}
      ></div>
    </div>
  );
}

function StaticPageEditorPreview({
  content,
  pageId,
}: {
  content: any;
  pageId: string;
}) {
  const store = useStore();
  const isComponentMounted = useRef(false);
  const previewEditorCreated = useRef(false);
  const canScroll = useCallback(
    () => isComponentMounted.current && previewEditorCreated.current,
    [],
  );
  const initialScrollTo = window.location.hash
    ? window.location.hash.slice(1)
    : "";
  const { handleScrollTo } = useEditorScroll({ canScroll, initialScrollTo });

  useEffect(() => {
    isComponentMounted.current = true;
    store.set(pageEditorAtom as any, null);

    return () => {
      store.set(readOnlyEditorAtom as any, null);
    };
  }, [store]);

  return (
    <EditorProvider
      editable={false}
      immediatelyRender={true}
      extensions={mainExtensions}
      content={content}
      onCreate={({ editor }) => {
        if (!editor) return;

        (editor.storage as { pageId?: string }).pageId = pageId;
        store.set(readOnlyEditorAtom as any, editor);
        handleScrollTo(editor);
        previewEditorCreated.current = true;
      }}
    />
  );
}

function LocalFallbackPageEditor({
  pageId,
  slugId,
  editable,
  content,
  currentUserId,
  userPageEditMode,
  showCommentPopup,
  onUnsavedChangesChange,
  onSavePendingChange,
  onLastSavedContentChange,
}: {
  pageId: string;
  slugId?: string;
  editable: boolean;
  content: any;
  currentUserId?: string;
  userPageEditMode: PageEditMode;
  showCommentPopup: boolean;
  onUnsavedChangesChange: (value: boolean) => void;
  onSavePendingChange: (value: boolean) => void;
  onLastSavedContentChange: (value: string) => void;
}) {
  const store = useStore();
  const localEditorRef = useRef<Editor | null>(null);
  const isMountedRef = useRef(false);
  const saveFailureNotifiedRef = useRef(false);
  const queuedSaveRef = useRef<SerializedContent | null>(null);
  const saveInFlightRef = useRef(false);
  const lastSavedContentRef = useRef(serializeEditorContent(content));
  const editorReadyRef = useRef(false);
  const normalizedContent = useMemo(
    () => normalizeProsemirrorContent(content),
    [content],
  );
  const canScroll = useCallback(
    () => isMountedRef.current && editorReadyRef.current,
    [],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });

  const persistLocalContent = useCallback(async () => {
    if (saveInFlightRef.current || !queuedSaveRef.current) {
      return;
    }

    const nextSave = queuedSaveRef.current;
    queuedSaveRef.current = null;
    saveInFlightRef.current = true;
    onSavePendingChange(true);

    try {
      const page = await updatePage({
        pageId,
        content: nextSave.content,
        operation: "replace",
        format: "json",
      });

      updatePageData(page);
      lastSavedContentRef.current = nextSave.serialized;
      onLastSavedContentChange(nextSave.serialized);
      onUnsavedChangesChange(false);
      saveFailureNotifiedRef.current = false;
    } catch {
      queuedSaveRef.current = nextSave;
      if (!saveFailureNotifiedRef.current) {
        notifications.show({
          message: "实时协作暂不可用，已切换为本地保存重试模式",
          color: "yellow",
        });
        saveFailureNotifiedRef.current = true;
      }
    } finally {
      saveInFlightRef.current = false;

      if (queuedSaveRef.current) {
        void persistLocalContent();
      } else {
        onSavePendingChange(false);
      }
    }
  }, [pageId, onLastSavedContentChange, onSavePendingChange, onUnsavedChangesChange]);

  const debouncedPersistLocalContent = useDebouncedCallback((editorJson: any) => {
    const serialized = serializeEditorContent(editorJson);

    if (!serialized || serialized === lastSavedContentRef.current) {
      onUnsavedChangesChange(false);
      onSavePendingChange(false);
      return;
    }

    queuedSaveRef.current = { content: editorJson, serialized };
    onSavePendingChange(true);
    void persistLocalContent();
  }, 1200);

  const editor = useEditor(
    {
      extensions: mainExtensions,
      editable,
      content: normalizedContent,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: createEditorProps(localEditorRef, pageId, currentUserId),
      onCreate({ editor }) {
        localEditorRef.current = editor;
        editorReadyRef.current = true;
        (editor.storage as { pageId?: string }).pageId = pageId;
        store.set(readOnlyEditorAtom as any, null);
        store.set(pageEditorAtom as any, editor);
        handleScrollTo(editor);
      },
      onUpdate({ editor }) {
        if (editor.isEmpty) return;

        const editorJson = editor.getJSON();
        updateCachedPageContent(pageId, slugId, editorJson);
        onUnsavedChangesChange(true);
        debouncedPersistLocalContent(editorJson);
      },
    },
    [pageId, editable, normalizedContent, currentUserId],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      const currentEditor = localEditorRef.current;
      if (currentEditor) {
        const currentContent = currentEditor.getJSON();
        const serialized = serializeEditorContent(currentContent);
        if (serialized && serialized !== lastSavedContentRef.current) {
          queuedSaveRef.current = { content: currentContent, serialized };
          void persistLocalContent();
        }
      }

      store.set(pageEditorAtom as any, null);
      onUnsavedChangesChange(false);
      onSavePendingChange(false);
    };
  }, [onSavePendingChange, onUnsavedChangesChange, persistLocalContent, store]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    store.set(readOnlyEditorAtom as any, null);
    store.set(pageEditorAtom as any, editor);

    return () => {
      if (store.get(pageEditorAtom as any) === editor) {
        store.set(pageEditorAtom as any, null);
      }
    };
  }, [editor, store]);

  useEffect(() => {
    if (!editor) return;

    if (userPageEditMode === PageEditMode.Edit && editable) {
      editor.setEditable(true);
      return;
    }

    editor.setEditable(false);
  }, [editor, editable, userPageEditMode]);

  if (!editor) {
    return <StaticPageEditorPreview content={normalizedContent} pageId={pageId} />;
  }

  return (
    <EditorRuntimeView
      editor={editor}
      editable={editable}
      pageId={pageId}
      showCommentPopup={showCommentPopup}
    />
  );
}

export default function PageEditor({
  pageId,
  editable,
  content,
}: PageEditorProps) {
  const collaborationURL = useCollaborationUrl();
  const isComponentMounted = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const store = useStore();

  const [currentUser] = useAtom(currentUserAtom);
  const [localPageEditMode] = useAtom(pageEditModePreferenceAtom);
  const [, setAsideState] = useAtom(asideStateAtom);
  const [, setActiveCommentId] = useAtom(activeCommentIdAtom);
  const [showCommentPopup, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const [isLocalSynced, setIsLocalSynced] = useState(false);
  const [isRemoteSynced, setIsRemoteSynced] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("preview");
  const [localHasUnsavedChanges, setLocalHasUnsavedChanges] = useState(false);
  const [isLocalSavePending, setIsLocalSavePending] = useState(false);
  const [yjsConnectionStatus, setYjsConnectionStatus] = useAtom(
    yjsConnectionStatusAtom,
  );
  const [, setRuntimeModeAtom] = useAtom(pageEditorRuntimeModeAtom);
  const { data: collabQuery, refetch: refetchCollabToken } = useCollabToken();
  const { isIdle, resetIdle } = useIdle(FIVE_MINUTES, { initialState: false });
  const documentState = useDocumentVisibility();
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const userPageEditMode =
    localPageEditMode ??
    normalizePageEditMode(currentUser?.user?.settings?.preferences?.pageEditMode) ??
    PageEditMode.Edit;
  const normalizedContent = useMemo(
    () => normalizeProsemirrorContent(content),
    [content],
  );
  const canScroll = useCallback(
    () => Boolean(isComponentMounted.current && editorRef.current),
    [],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });
  const lastSavedLocalContentRef = useRef(serializeEditorContent(normalizedContent));

  useEffect(() => {
    lastSavedLocalContentRef.current = serializeEditorContent(normalizedContent);
  }, [normalizedContent]);

  useEffect(() => {
    isComponentMounted.current = true;
    setRuntimeModeAtom("preview");

    return () => {
      store.set(pageEditorAtom as any, null);
      store.set(readOnlyEditorAtom as any, null);
      setYjsConnectionStatus("");
      setRuntimeModeAtom("preview");
    };
  }, [setRuntimeModeAtom, setYjsConnectionStatus, store]);

  const providersRef = useRef<{
    local: IndexeddbPersistence;
    remote: HocuspocusProvider;
    socket: HocuspocusProviderWebsocket;
  } | null>(null);
  const [providersReady, setProvidersReady] = useState(false);

  useEffect(() => {
    if (!providersRef.current) {
      const documentName = `page.${pageId}`;
      const ydoc = new Y.Doc();
      const local = new IndexeddbPersistence(documentName, ydoc);
      const socket = new HocuspocusProviderWebsocket({
        url: collaborationURL,
      });
      const onLocalSyncedHandler = () => {
        setIsLocalSynced(true);
      };
      const onStatusHandler = (event: onStatusParameters) => {
        setYjsConnectionStatus(event.status);
      };
      const onSyncedHandler = (event: onSyncedParameters) => {
        setIsRemoteSynced(event.state);
      };
      const onAuthenticationFailedHandler = () => {
        const providerToken = providersRef.current?.remote.configuration.token;
        const currentToken =
          typeof providerToken === "string"
            ? providerToken
            : collabQuery?.token;

        let shouldRefreshToken = !currentToken;
        if (currentToken) {
          try {
            const payload = jwtDecode<{ exp?: number }>(currentToken);
            const now = Date.now().valueOf() / 1000;
            shouldRefreshToken = !payload?.exp || now >= payload.exp;
          } catch {
            shouldRefreshToken = true;
          }
        }

        if (!shouldRefreshToken) return;

        refetchCollabToken().then((result) => {
          if (!result.data?.token) return;

          const remoteProvider = providersRef.current?.remote;
          if (!remoteProvider) return;

          socket.disconnect();
          setTimeout(() => {
            remoteProvider.configuration.token = result.data.token;
            socket.connect();
          }, 100);
        });
      };
      const remote = new HocuspocusProvider({
        websocketProvider: socket,
        name: documentName,
        document: ydoc,
        token: collabQuery?.token,
        onAuthenticationFailed: onAuthenticationFailedHandler,
        onStatus: onStatusHandler,
        onSynced: onSyncedHandler,
      });

      local.on("synced", onLocalSyncedHandler);
      providersRef.current = { socket, local, remote };
      setProvidersReady(true);
    } else {
      setProvidersReady(true);
    }

    return () => {
      providersRef.current?.socket.destroy();
      providersRef.current?.remote.destroy();
      providersRef.current?.local.destroy();
      providersRef.current = null;
    };
  }, [collaborationURL, pageId]);

  useEffect(() => {
    if (!collabQuery?.token || !providersRef.current) return;

    markEditorBootstrapStage(pageId, "collab-token-ready");

    const remoteProvider = providersRef.current.remote;
    const socket = providersRef.current.socket;

    if (remoteProvider.configuration.token !== collabQuery.token) {
      remoteProvider.configuration.token = collabQuery.token;
      if (yjsConnectionStatus === WebSocketStatus.Disconnected) {
        socket.connect();
      }
    }
  }, [collabQuery?.token, pageId, providersReady, yjsConnectionStatus]);

  useEffect(() => {
    if (!providersReady || !providersRef.current) return;
    const socket = providersRef.current.socket;

    if (
      isIdle &&
      documentState === "hidden" &&
      yjsConnectionStatus === WebSocketStatus.Connected
    ) {
      socket.disconnect();
      return;
    }
    if (
      documentState === "visible" &&
      yjsConnectionStatus === WebSocketStatus.Disconnected
    ) {
      resetIdle();
      socket.connect();
    }
  }, [documentState, isIdle, providersReady, resetIdle, yjsConnectionStatus]);

  useEffect(() => {
    if (!providersReady || !providersRef.current) {
      return;
    }

    const remoteProvider = providersRef.current.remote;
    remoteProvider.attach();

    return () => {
      remoteProvider.detach();
    };
  }, [providersReady, pageId]);

  const extensions = useMemo(() => {
    if (!providersReady || !providersRef.current || !currentUser?.user) {
      return mainExtensions;
    }

    const remoteProvider = providersRef.current.remote;

    return [
      ...mainExtensions,
      ...collabExtensions(remoteProvider, currentUser?.user),
    ];
  }, [currentUser?.user, providersReady]);

  const editor = useEditor(
    {
      extensions,
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: createEditorProps(editorRef, pageId, currentUser?.user.id),
      onCreate({ editor }) {
        editorRef.current = editor;
        (editor.storage as { pageId?: string }).pageId = pageId;
        handleScrollTo(editor);
      },
      onUpdate({ editor }) {
        if (editor.isEmpty) return;

        updateCachedPageContent(pageId, slugId, editor.getJSON());
      },
    },
    [pageId, editable, extensions, currentUser?.user.id],
  );

  const handleActiveCommentEvent = (event) => {
    const { commentId, resolved } = event.detail;

    if (resolved) {
      return;
    }

    setActiveCommentId(commentId);
    setAsideState({ tab: "comments", isAsideOpen: true });

    setTimeout(() => {
      const selector = `div[data-comment-id="${commentId}"]`;
      const commentElement = document.querySelector(selector);
      commentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  };

  useEffect(() => {
    document.addEventListener("ACTIVE_COMMENT_EVENT", handleActiveCommentEvent);
    return () => {
      document.removeEventListener(
        "ACTIVE_COMMENT_EVENT",
        handleActiveCommentEvent,
      );
    };
  }, []);

  useEffect(() => {
    setActiveCommentId(null);
    setShowCommentPopup(false);
    setAsideState({ tab: "", isAsideOpen: false });
  }, [pageId, setActiveCommentId, setAsideState, setShowCommentPopup]);

  const isSynced = isLocalSynced && isRemoteSynced;
  const collabReady =
    Boolean(editor) &&
    yjsConnectionStatus === WebSocketStatus.Connected &&
    isSynced;
  const canUseLocalFallback =
    editable && userPageEditMode === PageEditMode.Edit;

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (yjsConnectionStatus === WebSocketStatus.Connecting || !isSynced) {
        setYjsConnectionStatus(WebSocketStatus.Disconnected);
      }
    }, 7500);

    return () => clearTimeout(timeout);
  }, [isSynced, setYjsConnectionStatus, yjsConnectionStatus]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (userPageEditMode === PageEditMode.Edit && editable) {
      editor.setEditable(true);
      return;
    }

    editor.setEditable(false);
  }, [editor, editable, userPageEditMode]);

  useEffect(() => {
    if (!collabReady) {
      return;
    }

    markEditorBootstrapStage(pageId, "yjs-synced");

    if (runtimeMode === "preview") {
      setRuntimeMode("collab");
    }
  }, [collabReady, pageId, runtimeMode]);

  useEffect(() => {
    if (collabReady) {
      return;
    }

    if (!canUseLocalFallback) {
      if (runtimeMode !== "preview") {
        setRuntimeMode("preview");
      }
      return;
    }

    if (runtimeMode === "preview") {
      setRuntimeMode("local");
    }
  }, [canUseLocalFallback, collabReady, runtimeMode]);

  useEffect(() => {
    if (runtimeMode !== "local") {
      return;
    }

    markEditorBootstrapStage(pageId, "local-fallback-activated", {
      yjsConnectionStatus,
    });
  }, [pageId, runtimeMode, yjsConnectionStatus]);

  useEffect(() => {
    if (runtimeMode !== "local" || !collabReady || localHasUnsavedChanges || isLocalSavePending) {
      return;
    }

    const collabSerialized = editor ? serializeEditorContent(editor.getJSON()) : "";
    if (
      !lastSavedLocalContentRef.current ||
      collabSerialized === lastSavedLocalContentRef.current
    ) {
      setRuntimeMode("collab");
    }
  }, [collabReady, editor, isLocalSavePending, localHasUnsavedChanges, runtimeMode]);

  useEffect(() => {
    setRuntimeModeAtom(runtimeMode);
  }, [runtimeMode, setRuntimeModeAtom]);

  if (runtimeMode === "local") {
    return (
      <LocalFallbackPageEditor
        pageId={pageId}
        slugId={slugId}
        editable={editable}
        content={normalizedContent}
        currentUserId={currentUser?.user.id}
        userPageEditMode={userPageEditMode}
        showCommentPopup={showCommentPopup}
        onUnsavedChangesChange={setLocalHasUnsavedChanges}
        onSavePendingChange={setIsLocalSavePending}
        onLastSavedContentChange={(value) => {
          lastSavedLocalContentRef.current = value;
        }}
      />
    );
  }

  if (runtimeMode === "preview" || !editor) {
    return <StaticPageEditorPreview content={normalizedContent} pageId={pageId} />;
  }

  return (
    <EditorRuntimeView
      editor={editor}
      editable={editable}
      pageId={pageId}
      showCommentPopup={showCommentPopup}
    />
  );
}
