import { AiAction } from "@/ee/ai/types/ai.types.ts";
import { Sparkles, Maximize, Minimize, PenLine, CircleHelp, List, Smile, Languages, Trash, RefreshCw, ChevronLeft, Check, ArrowDownLeft, Copy, FilePlus, AlignJustify } from "lucide-react";

interface CommandItem {
  name: string;
  id: string;
  icon?: typeof Sparkles;
  action?: AiAction;
  prompt?: string;
  subCommandSet?: CommandSet;
}

type CommandSet = "main" | "tone" | "translate" | "result";

const mainItems: CommandItem[] = [
  {
    id: "improve-writing",
    name: "Improve writing",
    icon: Sparkles,
    action: AiAction.IMPROVE_WRITING,
  },
  {
    id: "fix-spelling-grammar",
    name: "Fix spelling & grammar",
    icon: Check,
    action: AiAction.FIX_SPELLING_GRAMMAR,
  },
  {
    id: "make-longer",
    name: "Make longer",
    icon: FilePlus,
    action: AiAction.MAKE_LONGER,
  },
  {
    id: "make-shorter",
    name: "Make shorter",
    icon: AlignJustify,
    action: AiAction.MAKE_SHORTER,
  },
  {
    id: "continue-writing",
    name: "Continue writing",
    icon: PenLine,
    action: AiAction.CONTINUE_WRITING,
  },
  {
    id: "explain",
    name: "Explain",
    icon: CircleHelp,
    action: AiAction.EXPLAIN,
  },
  {
    id: "summarize",
    name: "Summarize",
    icon: List,
    action: AiAction.SUMMARIZE,
  },
  {
    id: "change-tone",
    name: "Change tone",
    icon: Smile,
    subCommandSet: "tone",
  },
  {
    id: "translate",
    name: "Translate",
    icon: Languages,
    subCommandSet: "translate",
  },
];
const toneItems: CommandItem[] = [
  {
    id: "back",
    name: "Back",
    icon: ChevronLeft,
  },
  {
    id: "tone-professional",
    name: "Professional",
    icon: Smile,
    action: AiAction.CHANGE_TONE,
    prompt: "Professional",
  },
  {
    id: "tone-casual",
    name: "Casual",
    icon: Smile,
    action: AiAction.CHANGE_TONE,
    prompt: "Casual",
  },
  {
    id: "tone-friendly",
    name: "Friendly",
    icon: Smile,
    action: AiAction.CHANGE_TONE,
    prompt: "Friendly",
  },
];
const translateItems: CommandItem[] = [
  {
    id: "back",
    name: "Back",
    icon: ChevronLeft,
  },
  {
    id: "translate-english",
    name: "English",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "English",
  },
  {
    id: "translate-spanish",
    name: "Spanish",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Spanish",
  },
  {
    id: "translate-german",
    name: "German",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "German",
  },
  {
    id: "translate-french",
    name: "French",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "French",
  },
  {
    id: "translate-dutch",
    name: "Dutch",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Dutch",
  },
  {
    id: "translate-portuguese",
    name: "Portuguese",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Portuguese",
  },
  {
    id: "translate-italian",
    name: "Italian",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Italian",
  },
  {
    id: "translate-japanese",
    name: "Japanese",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Japanese",
  },
  {
    id: "translate-korean",
    name: "Korean",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Korean",
  },
  {
    id: "translate-swedish",
    name: "Swedish",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Swedish",
  },
  {
    id: "translate-chinese",
    name: "Chinese (Simplified)",
    icon: Languages,
    action: AiAction.TRANSLATE,
    prompt: "Simplified Chinese",
  },
];
const resultItems: CommandItem[] = [
  { id: "result-replace", name: "Replace", icon: Check },
  { id: "result-insert-below", name: "Insert below", icon: ArrowDownLeft },
  { id: "result-copy", name: "Copy", icon: Copy },
  { id: "result-discard", name: "Discard", icon: Trash },
  {
    id: "result-try-again",
    name: "Try again",
    icon: RefreshCw,
  },
];
const commandItems: Record<CommandSet, CommandItem[]> = {
  main: mainItems,
  tone: toneItems,
  translate: translateItems,
  result: resultItems,
};

export type { CommandItem, CommandSet };
export { commandItems };
