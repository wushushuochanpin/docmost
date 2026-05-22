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
  pageEditorCollaborationStatusAtom,
  pageEditorEditSessionAtom,
  pageEditorRuntimeModeAtom,
  pageEditorSessionStatusAtom,
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
import {
  Button,
  CloseButton,
  Group,
  Paper,
  Portal,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { updatePage } from "@/features/page/services/page-service";
import { updatePageData } from "@/features/page/queries/page-query";
import { markEditorBootstrapStage } from "@/features/editor/lib/editor-bootstrap-metrics";
import { useEditorSessionLease } from "@/features/editor-session/use-editor-session-lease";
import { encodeEditSessionForUrl } from "@/features/editor-session/client-id";
import { saveEditorRecoveryDraft } from "@/features/editor-session/draft-store";
import { isCollaborationEnabled, isEditorSessionEnabled } from "@/lib/config";
import type {
  EditSession,
  EditorSessionStatus,
  EditorSessionWriteIntent,
} from "@/features/editor-session/types";
import type { PageEditorCollaborationDisabledReason } from "@/features/editor/atoms/editor-atoms";

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

function EditorSessionOverlay({
  opened,
  status,
  isContinuing,
  onContinueHere,
  onReadonly,
}: {
  opened: boolean;
  status: EditorSessionStatus;
  isContinuing: boolean;
  onContinueHere: () => void;
  onReadonly: () => void;
}) {
  const isPending = status === "pending_takeover";
  const isCurrentTabStopped =
    status === "takeover_requested" || status === "revoked";
  const title = isPending
    ? "正在接管编辑权"
    : isCurrentTabStopped
      ? "编辑已切换到另一端"
      : "此页面已在另一端打开";
  const description = isPending
    ? "正在等待另一端完成交接，当前页面暂时只读。"
    : isCurrentTabStopped
      ? "当前标签页已停止编辑。继续在这里编辑会停止另一端编辑，并重新接管。"
      : "当前页面已暂停编辑。继续在这里编辑会停止另一端编辑，并接管最新内容。";

  if (!opened) {
    return null;
  }

  return (
    <Portal>
      <div
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          width: "100vw",
          minHeight: "100vh",
          overflow: "auto",
          display: "grid",
          placeItems: "center",
          padding: 16,
          backgroundColor: "rgba(0, 0, 0, 0.52)",
        }}
      >
        <Paper
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-session-overlay-title"
          radius="md"
          shadow="xl"
          p="lg"
          style={{ width: "min(440px, calc(100vw - 32px))" }}
        >
          <Group
            justify="space-between"
            align="flex-start"
            mb="sm"
            wrap="nowrap"
          >
            <Text id="editor-session-overlay-title" fw={700} size="md">
              {title}
            </Text>
            {!isPending && (
              <CloseButton onClick={onReadonly} aria-label="只读查看" />
            )}
          </Group>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {description}
            </Text>
            <Group justify="flex-end">
              {!isPending && (
                <Button variant="default" onClick={onReadonly}>
                  只读查看
                </Button>
              )}
              <Button
                onClick={onContinueHere}
                loading={isContinuing || isPending}
                disabled={isPending}
              >
                继续在这里编辑
              </Button>
            </Group>
          </Stack>
        </Paper>
      </div>
    </Portal>
  );
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
  editSession,
  leaseStatus,
  onTakeoverAck,
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
  editSession?: EditSession;
  leaseStatus: EditorSessionStatus;
  onTakeoverAck: () => Promise<void>;
}) {
  const store = useStore();
  const localEditorRef = useRef<Editor | null>(null);
  const isMountedRef = useRef(false);
  const saveFailureNotifiedRef = useRef(false);
  const queuedSaveRef = useRef<SerializedContent | null>(null);
  const saveInFlightRef = useRef(false);
  const lastSavedContentRef = useRef(serializeEditorContent(content));
  const editorReadyRef = useRef(false);
  const handoffStartedRef = useRef(false);
  const normalizedContent = useMemo(
    () => normalizeProsemirrorContent(content),
    [content],
  );
  const canScroll = useCallback(
    () => isMountedRef.current && editorReadyRef.current,
    [],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });

  const persistLocalContent = useCallback(
    async (writeIntent: EditorSessionWriteIntent = "normal") => {
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
          editSession,
          writeIntent,
        });

        updatePageData(page);
        lastSavedContentRef.current = nextSave.serialized;
        onLastSavedContentChange(nextSave.serialized);
        onUnsavedChangesChange(false);
        saveFailureNotifiedRef.current = false;
      } catch {
        if (writeIntent === "handoff_flush") {
          await saveEditorRecoveryDraft({
            resourceType: "page",
            resourceId: pageId,
            content: nextSave.content,
            reason: "handoff_flush_failed",
          });
        } else {
          queuedSaveRef.current = nextSave;
        }
        if (!saveFailureNotifiedRef.current) {
          notifications.show({
            message: "实时协作暂不可用，已切换为本地保存重试模式",
            color: "yellow",
          });
          saveFailureNotifiedRef.current = true;
        }
      } finally {
        saveInFlightRef.current = false;

        if (queuedSaveRef.current && writeIntent !== "handoff_flush") {
          void persistLocalContent();
        } else {
          onSavePendingChange(false);
        }
      }
    },
    [
      editSession,
      pageId,
      onLastSavedContentChange,
      onSavePendingChange,
      onUnsavedChangesChange,
    ],
  );

  const debouncedPersistLocalContent = useDebouncedCallback(
    (editorJson: any) => {
      const serialized = serializeEditorContent(editorJson);

      if (!serialized || serialized === lastSavedContentRef.current) {
        onUnsavedChangesChange(false);
        onSavePendingChange(false);
        return;
      }

      queuedSaveRef.current = { content: editorJson, serialized };
      onSavePendingChange(true);
      void persistLocalContent();
    },
    1200,
  );

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
        (
          editor.storage as { pageId?: string; editSession?: EditSession }
        ).pageId = pageId;
        (editor.storage as { editSession?: EditSession }).editSession =
          editSession;
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

    (editor.storage as { editSession?: EditSession }).editSession = editSession;

    if (userPageEditMode === PageEditMode.Edit && editable) {
      editor.setEditable(true);
      return;
    }

    editor.setEditable(false);
  }, [editSession, editor, editable, userPageEditMode]);

  useEffect(() => {
    if (
      leaseStatus !== "takeover_requested" ||
      handoffStartedRef.current ||
      !localEditorRef.current ||
      !editSession
    ) {
      return;
    }

    handoffStartedRef.current = true;
    const currentContent = localEditorRef.current.getJSON();
    const serialized = serializeEditorContent(currentContent);
    queuedSaveRef.current = { content: currentContent, serialized };
    localEditorRef.current.setEditable(false);

    persistLocalContent("handoff_flush")
      .catch(() => undefined)
      .finally(() => {
        void onTakeoverAck();
      });
  }, [editSession, leaseStatus, onTakeoverAck, persistLocalContent]);

  if (!editor) {
    return (
      <StaticPageEditorPreview content={normalizedContent} pageId={pageId} />
    );
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
  const [, setCollaborationStatusAtom] = useAtom(
    pageEditorCollaborationStatusAtom,
  );
  const [, setEditorSessionStatusAtom] = useAtom(pageEditorSessionStatusAtom);
  const instanceCollaborationEnabled = isCollaborationEnabled();
  const workspaceCollaborationEnabled =
    currentUser?.workspace?.settings?.collaboration?.enabled !== false;
  const configuredCollaborationDisabledReason: PageEditorCollaborationDisabledReason =
    !instanceCollaborationEnabled
      ? "instance"
      : !workspaceCollaborationEnabled
        ? "workspace"
        : null;
  const canRequestCollabToken = !configuredCollaborationDisabledReason;
  const { data: collabQuery, refetch: refetchCollabToken } = useCollabToken({
    enabled: canRequestCollabToken,
  });
  const collaborationDisabledReason: PageEditorCollaborationDisabledReason =
    configuredCollaborationDisabledReason ??
    (collabQuery?.enabled === false
      ? (collabQuery.disabledReason ?? "workspace")
      : null);
  const collaborationEnabled = !collaborationDisabledReason;
  const { isIdle, resetIdle } = useIdle(FIVE_MINUTES, { initialState: false });
  const documentState = useDocumentVisibility();
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const userPageEditMode =
    localPageEditMode ??
    normalizePageEditMode(
      currentUser?.user?.settings?.preferences?.pageEditMode,
    ) ??
    PageEditMode.Edit;
  const editorSessionFeatureEnabled = isEditorSessionEnabled();
  const shouldAcquirePageLease =
    editorSessionFeatureEnabled &&
    editable &&
    userPageEditMode === PageEditMode.Edit;
  const pageLease = useEditorSessionLease({
    enabled: shouldAcquirePageLease,
    resourceType: "page",
    resourceId: pageId,
  });
  const pageLeaseWritable =
    !shouldAcquirePageLease || pageLease.status === "active";
  const effectiveEditable = editable && pageLeaseWritable;
  const collabEditSession = shouldAcquirePageLease
    ? pageLease.editSession
    : undefined;
  const canStartCollabProvider =
    collaborationEnabled &&
    collabQuery?.enabled !== false &&
    Boolean(collabQuery?.token) &&
    (!shouldAcquirePageLease ||
      (pageLease.status === "active" && Boolean(collabEditSession)));
  const collaborationURLWithSession = useMemo(() => {
    const encodedEditSession = encodeEditSessionForUrl(collabEditSession);
    if (!encodedEditSession) return collaborationURL;

    const url = new URL(collaborationURL);
    url.searchParams.set("editSession", encodedEditSession);
    return url.toString();
  }, [collabEditSession, collaborationURL]);
  const normalizedContent = useMemo(
    () => normalizeProsemirrorContent(content),
    [content],
  );
  const canScroll = useCallback(
    () => Boolean(isComponentMounted.current && editorRef.current),
    [],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });
  const lastSavedLocalContentRef = useRef(
    serializeEditorContent(normalizedContent),
  );
  const takeoverAckSentRef = useRef(false);
  const [dismissedOverlayKey, setDismissedOverlayKey] = useState<string | null>(
    null,
  );
  const [isContinueHerePending, setIsContinueHerePending] = useState(false);

  useEffect(() => {
    lastSavedLocalContentRef.current =
      serializeEditorContent(normalizedContent);
  }, [normalizedContent]);

  useEffect(() => {
    if (pageLease.status === "active") {
      takeoverAckSentRef.current = false;
      return;
    }

    if (pageLease.status === "revoked" && editorRef.current) {
      void saveEditorRecoveryDraft({
        resourceType: "page",
        resourceId: pageId,
        content: editorRef.current.getJSON(),
        reason: "editor_session_revoked",
      }).catch(() => undefined);
      return;
    }

    if (
      pageLease.status !== "takeover_requested" ||
      runtimeMode === "local" ||
      takeoverAckSentRef.current
    ) {
      return;
    }

    takeoverAckSentRef.current = true;
    const currentContent = editorRef.current?.getJSON();
    void (async () => {
      if (currentContent && pageLease.editSession) {
        try {
          const page = await updatePage({
            pageId,
            content: currentContent,
            operation: "replace",
            format: "json",
            editSession: pageLease.editSession,
            writeIntent: "handoff_flush",
          });
          updatePageData(page);
        } catch {
          await saveEditorRecoveryDraft({
            resourceType: "page",
            resourceId: pageId,
            content: currentContent,
            reason: "takeover_requested",
          }).catch(() => undefined);
        }
      }

      await pageLease.release("takeover_ack").catch(() => undefined);
    })();
  }, [pageId, pageLease, runtimeMode]);

  useEffect(() => {
    setEditorSessionStatusAtom(
      shouldAcquirePageLease ? pageLease.status : "disabled",
    );
    store.set(
      pageEditorEditSessionAtom as any,
      shouldAcquirePageLease ? pageLease.editSession : undefined,
    );

    return () => {
      setEditorSessionStatusAtom("disabled");
      store.set(pageEditorEditSessionAtom as any, undefined);
    };
  }, [
    pageLease.editSession,
    pageLease.status,
    setEditorSessionStatusAtom,
    shouldAcquirePageLease,
    store,
  ]);

  useEffect(() => {
    if (pageLease.status === "active" || !shouldAcquirePageLease) {
      setDismissedOverlayKey(null);
      setIsContinueHerePending(false);
    }
  }, [pageLease.status, shouldAcquirePageLease]);

  useEffect(() => {
    isComponentMounted.current = true;
    setRuntimeModeAtom("preview");

    return () => {
      store.set(pageEditorAtom as any, null);
      store.set(readOnlyEditorAtom as any, null);
      setYjsConnectionStatus("");
      setRuntimeModeAtom("preview");
      setCollaborationStatusAtom(
        collaborationDisabledReason ? "disabled" : "connecting",
      );
    };
  }, [
    collaborationDisabledReason,
    setCollaborationStatusAtom,
    setRuntimeModeAtom,
    setYjsConnectionStatus,
    store,
  ]);

  const providersRef = useRef<{
    local: IndexeddbPersistence;
    remote: HocuspocusProvider;
    socket: HocuspocusProviderWebsocket;
  } | null>(null);
  const [providersReady, setProvidersReady] = useState(false);

  useEffect(() => {
    if (!canStartCollabProvider) {
      setProvidersReady(false);
      return;
    }

    if (!providersRef.current) {
      const documentName = `page.${pageId}`;
      const ydoc = new Y.Doc();
      const local = new IndexeddbPersistence(documentName, ydoc);
      const socket = new HocuspocusProviderWebsocket({
        url: collaborationURLWithSession,
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

        let shouldRefreshToken = editorSessionFeatureEnabled || !currentToken;
        if (currentToken) {
          try {
            const payload = jwtDecode<{ exp?: number }>(currentToken);
            const now = Date.now().valueOf() / 1000;
            shouldRefreshToken =
              editorSessionFeatureEnabled ||
              !payload?.exp ||
              now >= payload.exp;
          } catch {
            shouldRefreshToken = true;
          }
        }

        if (!shouldRefreshToken) return;

        refetchCollabToken().then((result) => {
          if (!result.data?.token) {
            socket.disconnect();
            return;
          }

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
  }, [
    canStartCollabProvider,
    collaborationURLWithSession,
    editorSessionFeatureEnabled,
    pageId,
  ]);

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
      editable: effectiveEditable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: createEditorProps(editorRef, pageId, currentUser?.user.id),
      onCreate({ editor }) {
        editorRef.current = editor;
        (
          editor.storage as { pageId?: string; editSession?: EditSession }
        ).pageId = pageId;
        (editor.storage as { editSession?: EditSession }).editSession =
          collabEditSession;
        handleScrollTo(editor);
      },
      onUpdate({ editor }) {
        if (editor.isEmpty) return;

        updateCachedPageContent(pageId, slugId, editor.getJSON());
      },
    },
    [pageId, effectiveEditable, extensions, currentUser?.user.id],
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
    if (!editor) return;
    (editor.storage as { editSession?: EditSession }).editSession =
      collabEditSession;
  }, [collabEditSession, editor]);

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
    collaborationEnabled &&
    Boolean(editor) &&
    yjsConnectionStatus === WebSocketStatus.Connected &&
    isSynced &&
    pageLeaseWritable;
  const canUseLocalFallback =
    editable &&
    userPageEditMode === PageEditMode.Edit &&
    (!shouldAcquirePageLease ||
      pageLease.status === "active" ||
      (runtimeMode === "local" && pageLease.status === "takeover_requested"));

  useEffect(() => {
    if (!collaborationEnabled) {
      return;
    }

    const timeout = setTimeout(() => {
      if (yjsConnectionStatus === WebSocketStatus.Connecting || !isSynced) {
        setYjsConnectionStatus(WebSocketStatus.Disconnected);
      }
    }, 7500);

    return () => clearTimeout(timeout);
  }, [
    collaborationEnabled,
    isSynced,
    setYjsConnectionStatus,
    yjsConnectionStatus,
  ]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (userPageEditMode === PageEditMode.Edit && effectiveEditable) {
      editor.setEditable(true);
      return;
    }

    editor.setEditable(false);
  }, [editor, effectiveEditable, userPageEditMode]);

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
    if (
      runtimeMode !== "local" ||
      !collabReady ||
      localHasUnsavedChanges ||
      isLocalSavePending
    ) {
      return;
    }

    const collabSerialized = editor
      ? serializeEditorContent(editor.getJSON())
      : "";
    if (
      !lastSavedLocalContentRef.current ||
      collabSerialized === lastSavedLocalContentRef.current
    ) {
      setRuntimeMode("collab");
    }
  }, [
    collabReady,
    editor,
    isLocalSavePending,
    localHasUnsavedChanges,
    runtimeMode,
  ]);

  useEffect(() => {
    setRuntimeModeAtom(runtimeMode);
  }, [runtimeMode, setRuntimeModeAtom]);

  useEffect(() => {
    if (collaborationDisabledReason) {
      setCollaborationStatusAtom("disabled");
      return;
    }

    if (runtimeMode === "local") {
      setCollaborationStatusAtom("local");
      return;
    }

    if (collabReady) {
      setCollaborationStatusAtom("connected");
      return;
    }

    if (
      providersReady &&
      yjsConnectionStatus === WebSocketStatus.Disconnected
    ) {
      setCollaborationStatusAtom("reconnecting");
      return;
    }

    setCollaborationStatusAtom("connecting");
  }, [
    collabReady,
    collaborationDisabledReason,
    providersReady,
    runtimeMode,
    setCollaborationStatusAtom,
    yjsConnectionStatus,
  ]);

  const overlayStatus: EditorSessionStatus | null = [
    "blocked_by_other",
    "pending_takeover",
    "takeover_requested",
    "revoked",
  ].includes(pageLease.status)
    ? pageLease.status
    : null;
  const overlayKey = `${pageId}:${pageLease.status}:${pageLease.takeoverId ?? ""}:${pageLease.activeClientId ?? ""}:${pageLease.pendingClientId ?? ""}`;
  const showEditorSessionOverlay = Boolean(
    shouldAcquirePageLease &&
    overlayStatus &&
    dismissedOverlayKey !== overlayKey,
  );
  const handleContinueHere = useCallback(() => {
    setDismissedOverlayKey(null);
    setIsContinueHerePending(true);
    void pageLease
      .takeover()
      .catch(() => undefined)
      .finally(() => {
        setIsContinueHerePending(false);
      });
  }, [pageLease]);
  const handleReadonlyView = useCallback(() => {
    setDismissedOverlayKey(overlayKey);
    if (pageLease.status === "pending_takeover") {
      void pageLease.release("manual").catch(() => undefined);
    }
  }, [overlayKey, pageLease]);
  const editorSessionOverlay = overlayStatus ? (
    <EditorSessionOverlay
      opened={showEditorSessionOverlay}
      status={overlayStatus}
      isContinuing={isContinueHerePending}
      onContinueHere={handleContinueHere}
      onReadonly={handleReadonlyView}
    />
  ) : null;

  if (runtimeMode === "local") {
    return (
      <>
        {editorSessionOverlay}
        <LocalFallbackPageEditor
          pageId={pageId}
          slugId={slugId}
          editable={effectiveEditable}
          content={normalizedContent}
          currentUserId={currentUser?.user.id}
          userPageEditMode={userPageEditMode}
          showCommentPopup={showCommentPopup}
          onUnsavedChangesChange={setLocalHasUnsavedChanges}
          onSavePendingChange={setIsLocalSavePending}
          onLastSavedContentChange={(value) => {
            lastSavedLocalContentRef.current = value;
          }}
          editSession={pageLease.editSession}
          leaseStatus={pageLease.status}
          onTakeoverAck={() => pageLease.release("takeover_ack")}
        />
      </>
    );
  }

  if (runtimeMode === "preview" || !editor) {
    return (
      <>
        {editorSessionOverlay}
        <StaticPageEditorPreview content={normalizedContent} pageId={pageId} />
      </>
    );
  }

  return (
    <>
      {editorSessionOverlay}
      <EditorRuntimeView
        editor={editor}
        editable={effectiveEditable}
        pageId={pageId}
        showCommentPopup={showCommentPopup}
      />
    </>
  );
}
