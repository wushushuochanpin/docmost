import { atom, type PrimitiveAtom } from "jotai";
import { Socket } from "socket.io-client";

export const socketAtom = atom<Socket | null>(null) as PrimitiveAtom<Socket | null>;
