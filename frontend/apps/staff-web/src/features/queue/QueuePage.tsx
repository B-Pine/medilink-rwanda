import { NotFoundContent } from "../../pages/NotFoundPage";
import { BoardPage } from "./BoardPage";
import { MyQueuePage } from "./MyQueuePage";
import { useCan } from "./shared";

/** /queue: reception and admins get the board; doctors their own queue (design 04 §3.1, §3.2). */
export function QueuePage() {
  const operate = useCan("queue.operate");
  const call = useCan("queue.call");
  if (operate) return <BoardPage />;
  if (call) return <MyQueuePage />;
  return <NotFoundContent />;
}
