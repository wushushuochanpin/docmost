import { Sparkles, Search, FilePlus, Edit, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import ChatInput from "./chat-input";
import type { ChatAttachment, PageMention } from "../types/ai-chat.types";
import classes from "../styles/ai-chat.module.css";

type Suggestion = {
  icon: React.ReactNode;
  text: string;
  prompt: string;
};

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <Search size={16} />,
    text: "Search across all pages",
    prompt: "Search for pages about ",
  },
  {
    icon: <FilePlus size={16} />,
    text: "Create a new page",
    prompt: "Create a new page titled ",
  },
  {
    icon: <FileText size={16} />,
    text: "Summarize a page",
    prompt: "Summarize the page @",
  },
  {
    icon: <Edit size={16} />,
    text: "Update page content",
    prompt: "Update the page @",
  },
];

type Props = {
  isStreaming: boolean;
  onSend: (content: string, mentions: PageMention[], attachments: ChatAttachment[]) => void;
  onStop: () => void;
};

export default function ChatEmptyState({ isStreaming, onSend, onStop }: Props) {
  const { t } = useTranslation();

  const handleSuggestionClick = (prompt: string) => {
    onSend(prompt, [], []);
  };

  return (
    <div className={classes.emptyState}>
      <Sparkles size={48} strokeWidth={1.5} className={classes.emptyStateIcon} />
      <div className={classes.emptyStateBrand}>{t("Docmost AI")}</div>
      <h1 className={classes.emptyStateTitle}>
        {t("What can I help you with?")}
      </h1>

      <div className={classes.emptyStateInput}>
        <ChatInput
          isStreaming={isStreaming}
          onSend={onSend}
          onStop={onStop}
          placeholder={t("Ask anything... Use @ to mention pages")}
          autofocus
        />
      </div>

      <div className={classes.suggestionsSection}>
        <h2 className={classes.suggestionsLabel}>{t("Get started")}</h2>
        <div className={classes.suggestionsGrid}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              type="button"
              className={classes.suggestionCard}
              onClick={() => handleSuggestionClick(s.prompt)}
            >
              <span className={classes.suggestionIcon}>{s.icon}</span>
              <span className={classes.suggestionText}>{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
