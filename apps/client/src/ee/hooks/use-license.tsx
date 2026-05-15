import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";

export const useLicense = () => {
  const [workspace] = useAtom(workspaceAtom);
  return { hasLicenseKey: workspace?.hasLicenseKey };
};

export default useLicense;
