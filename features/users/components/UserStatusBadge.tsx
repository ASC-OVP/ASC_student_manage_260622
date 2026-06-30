
import { userStatusLabel, userStatusTone } from "@/features/users/lib/userStatus";

type Props = { isActive: boolean };

export default function UserStatusBadge({ isActive }: Props) {
  return <span data-tone={userStatusTone(isActive)}>{userStatusLabel(isActive)}</span>;
}
