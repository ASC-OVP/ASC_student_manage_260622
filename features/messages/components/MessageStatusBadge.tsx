
import { messageStatusLabel, messageStatusTone } from "@/features/messages/lib/messageStatus";

type Props = { status: string };

export default function MessageStatusBadge({ status }: Props) {
  return <span data-tone={messageStatusTone(status)}>{messageStatusLabel(status)}</span>;
}
