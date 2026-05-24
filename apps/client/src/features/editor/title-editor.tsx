import "@/features/editor/styles/index.css";
import React, { useCallback, useEffect, useRef } from "react";
import { notifications } from "@mantine/notifications";
import { isAxiosError } from "axios";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Text } from "@tiptap/extension-text";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useAtomValue, useStore } from "jotai";
import {
  pageEditorEditSessionAtom,
  currentPageEditModeAtom,
  pageEditorAtom,
  pageEditorSessionStatusAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import {
  updatePageData,
  useUpdateTitlePageMutation,
} from "@/features/page/queries/page-query";
import { useDebouncedCallback, getHotkeyHandler } from "@mantine/hooks";
import { useAtom } from "jotai";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import EmojiCommand from "@/features/editor/extensions/emoji-command.ts";
import { UpdateEvent } from "@/features/websocket/types";
import localEmitter from "@/lib/local-emitter.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { searchSpotlight } from "@/features/search/constants.ts";
import { pageEditModePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import classes from "@/features/editor/styles/editor.module.css";
import { isEditorSessionEnabled } from "@/lib/config";
import { useEditorSessionLease } from "@/features/editor-session/use-editor-session-lease";
import type { EditSession } from "@/features/editor-session/types";
import { platformModifierKey } from "@/lib";

function isEditorSessionConflict(error: unknown) {
  return (
    isAxiosError(error) &&
    error.response?.status === 409 &&
    error.response?.data?.code === "EDITOR_SESSION_CONFLICT"
  );
}

function normalizeTitleValue(title: string | null | undefined) {
  return title ?? "";
}

function buildTitleDocument(title: string) {
  if (!title) {
    return { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] };
  }

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
    ],
  };
}

export interface TitleEditorProps {
  pageId: string;
  slugId: string;
  title: string;
  updatedAt: Date | string;
  spaceSlug: string;
  editable: boolean;
  className?: string;
}

export function TitleEditor({
  pageId,
  slugId,
  title,
  updatedAt,
  spaceSlug,
  editable,
  className,
}: TitleEditorProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateTitlePageMutationAsync } =
    useUpdateTitlePageMutation();
  const store = useStore();
  const pageEditor = useAtomValue(pageEditorAtom);
  const pageEditorEditSession = useAtomValue(pageEditorEditSessionAtom);
  const emit = useQueryEmit();
  const navigate = useNavigate();
  const [currentUser] = useAtom(currentUserAtom);
  const [localPageEditMode] = useAtom(pageEditModePreferenceAtom);
  const userPageEditMode =
    localPageEditMode ??
    currentUser?.user?.settings?.preferences?.pageEditMode ??
    PageEditMode.Edit;
  const editorSessionFeatureEnabled = isEditorSessionEnabled();
  const hasActivePageEditor = Boolean(pageEditor && !pageEditor.isDestroyed);
  const shouldAcquireTitleLease =
    editorSessionFeatureEnabled &&
    editable &&
    userPageEditMode === PageEditMode.Edit &&
    !hasActivePageEditor;
  const titleLease = useEditorSessionLease({
    enabled: shouldAcquireTitleLease,
    resourceType: "page",
    resourceId: pageId,
  });

  const titleEditorRef = useRef<Editor | null>(null);
  const isMountedRef = useRef(true);
  const titleDirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const lastSavedTitleRef = useRef(normalizeTitleValue(title));
  const pageIdRef = useRef(pageId);
  const editableRef = useRef(editable);
  const editSessionRef = useRef<EditSession | undefined>(undefined);

  pageIdRef.current = pageId;
  editableRef.current = editable;
  editSessionRef.current = hasActivePageEditor
    ? pageEditorEditSession
    : titleLease.editSession;

  const sessionReady =
    !editorSessionFeatureEnabled || editSessionRef.current !== undefined;
  const effectiveEditable =
    editable && userPageEditMode === PageEditMode.Edit && sessionReady;

  const syncPageSlug = useCallback(
    (nextTitle?: string | null) => {
      const anchorId = window.location.hash
        ? window.location.hash.substring(1)
        : undefined;
      navigate(
        buildPageUrl(spaceSlug, slugId, nextTitle ?? undefined, anchorId),
        { replace: true },
      );
    },
    [navigate, slugId, spaceSlug],
  );

  const applyServerTitle = useCallback((editor: Editor, nextTitle: string) => {
    if (editor.getText() === nextTitle) {
      return;
    }

    editor.commands.setContent(buildTitleDocument(nextTitle), {
      emitUpdate: false,
    });
  }, []);

  const saveTitle = useCallback(() => {
    const titleEditor = titleEditorRef.current;
    if (
      !titleEditor ||
      !isMountedRef.current ||
      !pageIdRef.current ||
      !editableRef.current ||
      !titleEditor.isEditable ||
      saveInFlightRef.current
    ) {
      return;
    }

    const nextTitle = titleEditor.getText();
    if (nextTitle === lastSavedTitleRef.current) {
      titleDirtyRef.current = false;
      return;
    }

    if (editorSessionFeatureEnabled && !editSessionRef.current) {
      return;
    }

    saveInFlightRef.current = true;

    updateTitlePageMutationAsync({
      pageId: pageIdRef.current,
      title: nextTitle,
      editSession: editSessionRef.current,
      writeIntent: "normal",
    })
      .then((page) => {
        const syncedTitle = normalizeTitleValue(page.title);
        lastSavedTitleRef.current = syncedTitle;

        if (titleEditor.getText() === nextTitle) {
          titleDirtyRef.current = false;
          if (syncedTitle !== nextTitle) {
            applyServerTitle(titleEditor, syncedTitle);
          }
        }

        updatePageData(page);
        syncPageSlug(page.title);

        const event: UpdateEvent = {
          operation: "updateOne",
          spaceId: page.spaceId,
          entity: ["pages"],
          id: page.id,
          payload: {
            title: page.title,
            slugId: page.slugId,
            parentPageId: page.parentPageId,
            icon: page.icon,
          },
        };
        localEmitter.emit("message", event);
        emit(event);
      })
      .catch((error) => {
        if (!isMountedRef.current || isEditorSessionConflict(error)) {
          return;
        }

        const message = isAxiosError(error)
          ? error.response?.data?.message
          : undefined;
        notifications.show({
          color: "red",
          message:
            message ||
            t("Failed to save page title. Please try again in a moment."),
        });
      })
      .finally(() => {
        saveInFlightRef.current = false;
      });
  }, [
    applyServerTitle,
    editorSessionFeatureEnabled,
    emit,
    syncPageSlug,
    t,
    updateTitlePageMutationAsync,
  ]);

  const saveTitleRef = useRef(saveTitle);
  saveTitleRef.current = saveTitle;

  const debounceUpdate = useDebouncedCallback(() => {
    saveTitleRef.current();
  }, 500);

  const titleEditor = useEditor({
    extensions: [
      Document.extend({
        content: "heading",
      }),
      Heading.configure({
        levels: [1],
      }),
      Text,
      Placeholder.configure({
        placeholder: t("Untitled"),
        showOnlyWhenEditable: false,
      }),
      EmojiCommand,
    ],
    onCreate({ editor }) {
      titleEditorRef.current = editor;
      store.set(titleEditorAtom as any, editor);
      const initialTitle = normalizeTitleValue(title);
      lastSavedTitleRef.current = initialTitle;
      titleDirtyRef.current = false;
      applyServerTitle(editor, initialTitle);
      syncPageSlug(title);
    },
    onUpdate() {
      titleDirtyRef.current = true;
      debounceUpdate();
    },
    editable: effectiveEditable,
    content: buildTitleDocument(normalizeTitleValue(title)),
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": t("Page title"),
      },
      handleDOMEvents: {
        blur: () => {
          saveTitleRef.current();
          return false;
        },
        keydown: (_view, event) => {
          if (platformModifierKey(event) && event.code === "KeyS") {
            event.preventDefault();
            return true;
          }
          if (platformModifierKey(event) && event.code === "KeyK") {
            searchSpotlight.open();
            return true;
          }
        },
      },
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      debounceUpdate.cancel();
    };
  }, [pageId]);

  useEffect(() => {
    if (!shouldAcquireTitleLease) {
      return;
    }

    store.set(pageEditorEditSessionAtom as any, titleLease.editSession);
    store.set(pageEditorSessionStatusAtom as any, titleLease.status);

    return () => {
      store.set(pageEditorEditSessionAtom as any, undefined);
      store.set(pageEditorSessionStatusAtom as any, "disabled");
    };
  }, [
    shouldAcquireTitleLease,
    store,
    titleLease.editSession,
    titleLease.status,
  ]);

  useEffect(() => {
    if (!titleEditor) {
      return;
    }

    titleEditor.setEditable(effectiveEditable);
  }, [effectiveEditable, titleEditor]);

  useEffect(() => {
    return () => {
      titleEditorRef.current = null;
      store.set(titleEditorAtom as any, null);
    };
  }, [pageId, store]);

  const openSearchDialog = () => {
    document.dispatchEvent(new CustomEvent("openFindDialogFromEditor", {}));
  };

  function handleTitleKeyDown(event: React.KeyboardEvent) {
    if (!titleEditor || !pageEditor || event.shiftKey) return;

    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }

    const { key } = event;
    const { $head } = titleEditor.state.selection;

    if (key === "Enter") {
      event.preventDefault();
      saveTitleRef.current();

      const { $from } = titleEditor.state.selection;
      const titleText = titleEditor.getText();
      const textOffset = $from.parentOffset;
      const textAfterCursor = titleText.slice(textOffset);
      const endPos = titleEditor.state.doc.content.size;
      if (textAfterCursor) {
        titleEditor.commands.deleteRange({ from: $from.pos, to: endPos });
      }

      pageEditor
        .chain()
        .command(({ tr }) => {
          tr.setMeta("addToHistory", false);
          return true;
        })
        .insertContentAt(0, {
          type: "paragraph",
          content: textAfterCursor
            ? [{ type: "text", text: textAfterCursor }]
            : undefined,
        })
        .focus("start")
        .run();
      return;
    }

    const shouldFocusEditor =
      key === "ArrowDown" || (key === "ArrowRight" && !$head.nodeAfter);

    if (shouldFocusEditor) {
      pageEditor.commands.focus("start");
    }
  }

  return (
    <div
      id="page-title-anchor"
      className={`${className ?? ""} ${classes.titleRow}`}
    >
      <div className={classes.titleEditorContent}>
        <EditorContent
          editor={titleEditor}
          onKeyDown={(event) => {
            getHotkeyHandler([["mod+F", openSearchDialog]])(event);
            handleTitleKeyDown(event);
          }}
        />
      </div>
    </div>
  );
}
