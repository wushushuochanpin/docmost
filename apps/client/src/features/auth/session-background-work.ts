import { isCancelledError } from "@tanstack/react-query";
import { isCancel } from "axios";

/** Attach at the task owner: session/query cancellation is expected, while
 * other failures still go to that owner's explicit error/reporting path. */
export async function settleSessionBackgroundWork(
  work: Promise<unknown>,
  reportFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (!isCancelledError(error) && !isCancel(error)) reportFailure(error);
  }
}
